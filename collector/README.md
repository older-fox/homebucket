# HomeBucket 收集器（collector）

**每个 HomeBucket 实例都有一份自己的物品库；收集器让"同一款商品"的资料在所有实例之间共享。**

你扫一次 `6901234567890` 录入的电池，别人再扫同一个条码时就能自动填好名称、厂商、型号、分类和图片 ——
不是靠某个中心数据库事先收录，而是靠所有实例把自己的观测报上来，由收集器合并成一份"对所有人都成立"的资料。

它只收**公共**信息：名称 / 描述 / 型号 / 厂商 / 分类 / 基础单位 / 图片 / 扩展属性。
数量、价格、存放位置、序列号、保修期这类"某个家庭的私有状态"一概不收。

- 一个 npm 包、**一个进程、一个端口**：Nuxt 4（SSR 页面 + Nitro API）+ TypeORM(SQLite) + Tailwind v4。
- 不依赖仓库里的 `server/` 与 `web/`，也不与它们共享代码 —— 把它整个目录拷到另一台机器就能独立跑。
- 不引入额外基础设施：一个 SQLite 文件、一个进程、一个端口。

---

## 目录

- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [Docker 部署](#docker-部署)
- [两套协议](#两套协议)
  - [A. 实例协议（收集器自己的 v1）](#a-实例协议收集器自己的-v1)
  - [B. 老契约（已部署实例的 DATA_COLLECTION_ENDPOINT）](#b-老契约已部署实例的-data_collection_endpoint)
- [实例怎么接进来](#实例怎么接进来)
- [数据合并规则](#数据合并规则)
- [置信度怎么算](#置信度怎么算)
- [管理台](#管理台)
- [安全与信任模型](#安全与信任模型)
- [运维](#运维)
- [目录结构](#目录结构)
- [开发约定](#开发约定)

---

## 快速开始

```bash
cd collector

npm install
cp .env.example .env        # 至少填一个 COLLECTOR_ADMIN_TOKEN（生产环境必须 ≥8 字符）
npm run dev                 # http://127.0.0.1:3400 —— 页面和 API 同一个进程，带热更新
```

想跑生产形态：

```bash
npm run build               # 产出 .output/（服务端 + 页面 + 资源都在里面）
npm start                   # node scripts/start.mjs，3400 上同时提供 API 和页面
```

启动时会把迁移自动跑掉（`COLLECTOR_AUTO_MIGRATE=true`），不需要额外的迁移步骤；
数据库没准备好就是**启动失败**，而不是第一个请求才报错。

## 环境变量

所有变量都写在 `collector/.env` 里（只读这个文件，不读仓库根目录的 `.env`）。完整模板见 `.env.example`。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `COLLECTOR_PORT` | `3400` | 监听端口。**刻意不用 3000/3001**：那两个是主服务的。 |
| `COLLECTOR_HOST` | `0.0.0.0` | 监听地址。 |
| `COLLECTOR_DB_PROVIDER` | `sqlite` | 只支持 `sqlite`；填别的会显式启动失败，不做静默回退。 |
| `COLLECTOR_DB_FILE_PATH` | `data/collector.db` | SQLite 文件。相对路径按**启动时的工作目录**解析（Nitro 下没有稳定的 `__dirname`）。 |
| `COLLECTOR_AUTO_MIGRATE` | `true` | 启动时自动跑 TypeORM 迁移。 |
| `COLLECTOR_ADMIN_TOKEN` | 空 | 纠错台令牌。`NODE_ENV=production` 时**必须**设置且 ≥8 字符，否则拒绝启动。 |
| `COLLECTOR_REGISTRATION_OPEN` | `true` | 是否允许新实例自我注册。关掉后新实例拿到 403，已注册的照常上报。 |
| `COLLECTOR_CORS_ORIGIN` | `*` | 允许的跨域来源；多个用逗号分隔。 |
| `COLLECTOR_MAX_BODY_SIZE` | `64kb` | 请求体上限（无单位的数字按字节算）。 |
| `COLLECTOR_RATE_LIMIT` | `240` | 每个来源 IP 在每个窗口内的请求数上限（查询/注册/上报共用）。 |
| `COLLECTOR_RATE_WINDOW_MS` | `60000` | 限流窗口长度。 |
| `NODE_ENV` | `development` | `production` 会收紧（管理令牌必须显式配置）。 |

迁移到 Nuxt 之后**没有** `COLLECTOR_API_PREFIX` / `COLLECTOR_WEB_DIR`：接口路径由 `server/api/` 的目录结构决定（统一挂在 `/api/**`），页面由 Nuxt 自己提供。

## Docker 部署

镜像的构建上下文是 `collector/` 目录本身（不是仓库根）：

```bash
docker build -t homebucket-collector collector
docker run -d --name homebucket-collector \
  -p 3400:3400 \
  -v /srv/homebucket-collector:/data \
  -e COLLECTOR_ADMIN_TOKEN='换成足够长的随机串' \
  -e NODE_ENV=production \
  homebucket-collector
```

`docker-compose.yml` 最小可用例子：

```yaml
services:
  collector:
    image: homebucket-collector
    # 容器以非 root（uid 1000）运行：宿主机目录要先 chown 1000:1000
    #   sudo mkdir -p /srv/homebucket-collector && sudo chown 1000:1000 /srv/homebucket-collector
    volumes:
      - /srv/homebucket-collector:/data
    environment:
      NODE_ENV: production
      COLLECTOR_ADMIN_TOKEN: 换成足够长的随机串
      COLLECTOR_REGISTRATION_OPEN: "true"
    ports:
      - "3400:3400"
    restart: unless-stopped
```

镜像里已经设好 `COLLECTOR_DB_FILE_PATH=/data/collector.db` 与 `COLLECTOR_AUTO_MIGRATE=true`，
所以只要挂 `/data` 就能持久化，`HEALTHCHECK` 打的是 `GET /api/health`。

**放到公网前请做两件事**：套一层 HTTPS 反代（nginx/Caddy/Cloudflare 都行，实例端走的是 http(s) 明文请求），
以及确认反代把 `X-Forwarded-For` 传下来 —— 收集器读它做限流，否则所有实例会共用一份额度。

## 两套协议

收集器同时提供两套 HTTP 协议，服务于两类调用方：

| | A. 实例协议 `v1` | B. 老契约 |
| --- | --- | --- |
| 调用方 | 收集器自己的前端、新接入的实例 | **已经部署出去**的 HomeBucket 实例 |
| 身份 | `x-collector-key`（自我注册拿到的 key） | 无（匿名） |
| 查询 | `GET /api/v1/items/:barcode` | `GET /api/v1/barcodes/:code` |
| 上报 | `POST /api/v1/contributions` | `POST /api/v1/observations` |

两套协议写进的是**同一份数据**：老契约的上报在审计里表现为"来源 `api`、没有实例 id"的匿名观测，
和带 key 的上报走完全一样的合并路径，也一样可以被屏蔽、被锁定字段挡住。

### A. 实例协议（收集器自己的 v1）

公开读（不需要任何身份）：

```bash
# 搜索（q 可选；默认按更新时间倒序）
curl 'http://127.0.0.1:3400/api/v1/items?q=battery&page=1&pageSize=20'
# → { "items": [...], "total": 12, "page": 1, "pageSize": 20 }

# 详情：每个字段都带来源（谁报的、什么时候、是否被人工锁定）
curl http://127.0.0.1:3400/api/v1/items/6901234567890
# → { "barcode": "6901234567890", "name": "...", "fields": [ { "field": "name", "value": "...",
#      "source": "instance", "instanceId": 3, "instanceName": "书房那台", "observedAt": "...", "locked": false }, ... ],
#      "imageUrls": [...], "attributes": {...}, "lockedFields": [...], "mergedIntoId": null }

# 某个条码的上报记录（审计，公开可读）
curl http://127.0.0.1:3400/api/v1/items/6901234567890/contributions

# 统计概览（管理台首页那几张卡片用的就是它）
curl http://127.0.0.1:3400/api/v1/stats

# 健康检查
curl http://127.0.0.1:3400/api/health
```

需要身份的写入：

```bash
# 1) 注册（每个实例只做一次）：明文 key 只在这里返回一次
curl -X POST http://127.0.0.1:3400/api/v1/instances \
  -H 'content-type: application/json' \
  -d '{"name":"书房那台","platform":"linux","version":"1.4.0"}'
# → { "instance": {...}, "key": "hbc_<40位十六进制>", "keyPrefix": "hbc_ab12cd34",
#      "note": "请把 key 保存到实例配置里：这是唯一一次返回明文" }

# 2) 查自己的身份与累计上报数
curl http://127.0.0.1:3400/api/v1/instances/me -H 'x-collector-key: hbc_...'

# 3) 上报一次观测（按条码建档或并入已有条目）
curl -X POST http://127.0.0.1:3400/api/v1/contributions \
  -H 'content-type: application/json' -H 'x-collector-key: hbc_...' \
  -d '{"barcode":"6901234567890","name":"5 号碱性电池","manufacturer":"南孚","model":"LR6","category":"电池","attributes":{"容量":"2500mAh"}}'
# → 201 { "created": false, "applied": ["name","manufacturer","model","category"],
#        "contributionId": 42, "item": {...} }
```

`applied` 是"这次真正写进物品的字段"：被人工锁定的字段不会覆盖既有值。

管理接口（`x-admin-token`，见 [管理台](#管理台)）：`/api/admin/...`。

### B. 老契约（已部署实例的 DATA_COLLECTION_ENDPOINT）

HomeBucket 主仓库 `server/src/collection/collection.service.ts` 里的客户端协议，从一开始就写成了对外规范
（根 README 的 "Barcode data collection" 一节）。它是**匿名**的：不带任何鉴权头，因为它是按"任何一台实例都能直接 POST 观测"设计的 ——
所以收集器把这两个接口原样实现，**已经部署出去的实例一行代码都不用改**，只要把 `DATA_COLLECTION_ENDPOINT` 指过来。

```bash
# 查询：200 = 收录（实例据此预填表单），404 = 未收录（实例照常让用户自己填）
curl http://127.0.0.1:3400/api/v1/barcodes/6901234567890
# → { "barcode": "6901234567890", "name": "...", "manufacturer": "...", "model": "...",
#      "category": "...", "imageUrl": null, "confidence": 0.5, "sources": 1,
#      "description": null, "attributes": {}, "updatedAt": "..." }

# 上报：fire-and-forget，实例不关心响应体，只要 2xx
curl -X POST http://127.0.0.1:3400/api/v1/observations \
  -H 'content-type: application/json' \
  -d '{"barcode":"6901234567890","name":"5 号碱性电池","manufacturer":"南孚","clientVersion":"homebucket/1"}'
# → 200 { "accepted": true, "created": true, "applied": [...], "contributionId": 43 }
```

两处刻意的取舍：

1. **`barcode` 回显请求里的写法**，而不是库里的归一化条码。实例可能拿它跟自己的扫码结果比对或直接落库，
   回显它的输入最不容易出意外（`BOSCH-GSB18V55` 就回 `BOSCH-GSB18V55`）。要看规范化后的身份，走 v1 的详情接口。
2. 返回体里多了 `description` / `attributes` / `updatedAt` 三个字段。老客户端只读它认识的键，多余字段无害；
   收集器自己的前端则可以直接复用同一个响应。

## 实例怎么接进来

**已经部署出去的实例**不需要改代码：把它的 `DATA_COLLECTION_ENDPOINT` 指到收集器即可。

```bash
DATA_COLLECTION_ENABLED=true
DATA_COLLECTION_ENDPOINT=https://barcode.example.com/api/v1
DATA_COLLECTION_SUBMIT=true
DATA_COLLECTION_TIMEOUT_MS=1500
```

收集器不可达时实例会静默降级（超时 → `debug` 日志，查询返回"未收录"），扫码录入主流程不受影响。

**用收集器自己的 v1 协议接入**（推荐，能带实例身份、能上报更多字段）流程是：

1. 首次启动时 `POST /api/v1/instances` 拿到 `hbc_...`，把 key 存进本地配置（**只返回一次**）；
2. 扫码后 `GET /api/v1/items/:barcode`：命中就预填表单，未收录（404）就让用户自己填；
3. 用户确认保存物品时，`POST /api/v1/contributions` 把这次观测报上去，带上 `x-collector-key`；
4. 可选：详情页把 `fields[]` 渲染出来，让用户看到"这个字段是谁报的、什么时候"。

## 数据合并规则

规则显式写死在 `server/utils/identity.ts` 里，不做"智能"猜测 —— 用户能预期的规则才敢用。

**身份**：

- 有条码 → `barcode:<归一化条码>`。归一化 = 去掉空白/连字符、转大写（`bosch-gsb 18v55` 与 `BOSCHGSB18V55` 是同一条目）。
- 没有条码 → `fingerprint:<sha256(名称+型号+厂商)>`，给还没印条码的东西留一条路。

**字段**：

1. **字段级"最新非空观测胜出"**：谁报得晚谁的值算数，但空值永远不覆盖已有值 —— 后来的实例只补它知道的部分。
2. 时间比较用 `observedAt`：离线实例几天后批量补报也能被正确处理；服务器会把**未来**时间夹回现在，
   免得一条 `9999-01-01` 永久霸占字段。
3. 人工锁定的字段（`lockedFields`）**跳过自动合并**：纠错台改过的字段不会被下一条上报冲掉。
   锁定只挡自动改写，管理员自己还能再改。
4. `imageUrls` 是**累加**的（照片只有"多"没有"错"，去重后最多 12 张）。
5. `attributes` 按 key 独立套用上面的规则。
6. 时间相同时后到的胜出。

`CatalogItem` 只是这些观测**重放出来的物化投影**：屏蔽一条上报、改一次人工纠错、合并两个条目之后，
都会重算投影 —— 所以不需要维护任何汇总表。全库重放（`POST /api/admin/recompute`）永远能重算出一致的结果。

## 置信度怎么算

老契约里的 `confidence` 是一个 0~1 的数，用来告诉实例"这份资料有多少来源在互相印证"：

```
confidence = 赞同当前值的观测数 / (可比较的观测数 + 1)
```

- 1 个来源 → `1/2 = 0.5`
- 2 个来源一致 → `2/3 = 0.67`
- 3 个来源里只有 1 个和当前值一致 → `1/4 = 0.25`

分母加一是**拉普拉斯式收缩**，也是"永不等于 1"的刻意设计：收集器的价值在于多来源印证，
一个孤零零的上报不该被标成 100% 可信。`sources` 是"这个条目一共有多少条可见观测"。

## 管理台

浏览器打开收集器地址（生产形态即 `http://<host>:3400/`），页面有五个：

| 页面 | 作用 |
| --- | --- |
| 查询 | 按条码/关键字搜物品，看详情 |
| 详情 | 每个字段的值 + **来源**（人工纠错 / 实例名 / 未知来源）、观测时间、锁定状态 |
| 审计 | 所有上报记录，可按实例 / 物品 / 来源 / 是否被屏蔽筛选，单条屏蔽或恢复 |
| 纠错台 | 改字段（可同时锁定）、显式清空字段、屏蔽上报、合并重复条目、封禁/解封实例 |
| 统计 | 物品/上报/实例总量与近期趋势（聚合 SQL 实时算，不落汇总表） |

页面是 Nuxt SSR（公开页）+ Tailwind v4，深色模式用 `@nuxtjs/color-mode`（`.dark` class，跟随系统，可手动切换）。
管理台靠顶栏那个"管理令牌"输入框鉴权（存在浏览器 localStorage，请求时放在 `x-admin-token` 头里）：

```bash
curl http://127.0.0.1:3400/api/admin/session -H 'x-admin-token: <COLLECTOR_ADMIN_TOKEN>'
# → { "scope": "admin", "service": "...", "version": "0.1.0", "now": "..." }
```

常用管理接口：

```
GET    /api/admin/items?q=                 # 物品列表（含合并后隐藏的条目）
GET    /api/admin/items/:id
PATCH  /api/admin/items/:id                # 改字段 + lockedFields + clearFields（人工置空）
POST   /api/admin/items/:id/merge          # { sourceItemId } 合并重复条目
POST   /api/admin/items/:id/recompute      # 重放单个条目
GET    /api/admin/contributions?source=api # 上报审计
POST   /api/admin/contributions/:id/block  # { blocked, reason }
GET    /api/admin/instances
POST   /api/admin/instances/:id/block      # { blocked, reason }
POST   /api/admin/recompute                # 全库重放
```

接口的错误统一是 `{"statusCode":404,"code":"item.notFound","message":"..."}`，
前端按 `code` 说人话，所以 `code` 是稳定的、`message` 只是给人看的。

## 安全与信任模型

- **收集器不判断真假**。它汇总观测、把来源摊开给所有人看，靠"多来源互相印证 + 人工纠错"收敛，
  而不是靠校验。要做的是让坏数据**可被发现、可被回溯、可被一键屏蔽**。
- **匿名上报是刻意的**：老契约不带身份，因为要兼容已经部署出去的实例。匿名≠免审计 ——
  匿名上报同样进审计页（来源 `api`、无实例 id），管理员照样能屏蔽单条。
- 带 key 的上报会记实例身份，被封禁的实例直接 403（`instance.blocked`），它的历史上报仍在审计台可见、可逐条处理。
- 限流按来源 IP 固定窗口计数（默认 240 次/分钟），管理接口不占这个额度。
- 库里的 key 只有 `sha256`，明文只在注册响应里出现一次；列表只显示前 12 位前缀。

## 运维

```bash
# 备份：SQLite 就一个文件（WAL 模式下还有 -wal/-shm）
sqlite3 data/collector.db ".backup '/backup/collector-$(date +%F).db'"

# 迁移：容器里默认启动时自动跑（COLLECTOR_AUTO_MIGRATE=true），
# 手写迁移放在 server/database/migrations/ 并在 migrations/index.ts 里显式登记。

# 实体改了但忘了写迁移，这个探针会响（在临时库上跑迁移后比对实体定义）
npm run db:check-drift
```

## 目录结构

```
collector/
├── nuxt.config.ts       # 一个进程同时提供页面（SSR）与 API（Nitro）
├── server/              # 后端（Nitro，esbuild 打包）
│   ├── api/v1/          # 公开查询、上报、实例注册、统计
│   ├── api/admin/       # 纠错台（x-admin-token）
│   ├── api/[...].ts     # 未匹配的 /api/** 统一回 JSON 404（不糊 HTML）
│   ├── middleware/      # CORS、请求体上限、限流
│   ├── services/        # items / contributions / instances / stats / admin / compat
│   ├── dto/             # 手写校验（迁移后不再用 class-validator）
│   ├── utils/           # 归一化/合并规则、来源、分页、限流、错误信封……（纯函数，单测覆盖）
│   ├── database/        # EntitySchema 实体、数据源、迁移、PRAGMA
│   └── plugins/database.ts  # 先跑迁移再开库；库没准备好就启动失败
├── app/                 # 前端（Nuxt 4 应用目录：pages / components / composables + Tailwind）
├── test/                # node:test 套件（npm test，对临时 SQLite 库跑）
├── scripts/             # start.mjs（生产启动）/ check-drift.mjs（零漂移探针）
└── Dockerfile
```

## 开发约定

```bash
npm run typecheck        # nuxt typecheck（服务端 tsc + 前端 vue-tsc），必须全干净
npm test                 # node:test：纯函数 + 服务层（对临时库）
npm run test:e2e         # 真 HTTP 端到端：自己拉一个 dev server + 临时库，跑完就关（约 1 分钟）
npm run build            # 产出 .output/
npm run db:check-drift   # 迁移零漂移探针
```

- `test:e2e` 也可以用 `COLLECTOR_BASE=http://127.0.0.1:3400 COLLECTOR_ADMIN_TOKEN=…` 打一个**已经在跑**的实例；
  那种用法要求目标库是**全新的**（脚本会灌一套自己的样例数据并断言条数），所以先删掉库文件再跑。
  它覆盖的是"契约级"行为：22 条路由的状态码与响应形状、字段级合并规则、锁定/屏蔽/合并/封禁后的重放、
  老契约（`GET /api/v1/barcodes/:code` + `POST /api/v1/observations`）的向后兼容、SSR 首屏与静态资源 MIME、
  CORS 与预检、未知接口回 JSON 404。这些正是单测盯不到的"接缝"，所以发版前必跑。

- TypeORM 实体用 **`EntitySchema`** 而不是装饰器：Nitro 用 esbuild 打包，esbuild 不支持
  `emitDecoratorMetadata`，装饰器实体会丢掉列类型（详见 `server/database/entities.ts` 的注释）。
- 迁移文件与实体的列/索引定义必须逐字一致，否则 `db:check-drift` 会失败；索引名沿用第一版迁移生成的名字。
- 时间戳一律以 ISO 字符串存在 `varchar` 列里：字典序就是时间序，绕开不同驱动的日期类型差异。
- 中文长注释写"为什么"，不写"是什么"。
