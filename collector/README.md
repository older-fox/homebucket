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
cp .env.example .env        # 开发环境可先留空，用默认账号 admin / dev-admin-password 登录
                            # （生产环境必须填 COLLECTOR_ADMIN_PASSWORD，≥8 字符，否则拒绝启动）
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
| `COLLECTOR_ADMIN_USERNAME` | `admin` | 纠错台账号名（2-32 位字母/数字/`.`/`_`/`-`，以字母或数字开头）。 |
| `COLLECTOR_ADMIN_PASSWORD` | 空 | 纠错台口令（≥8 字符，**不做 trim**）。`NODE_ENV=production` 时**必须**设置，否则拒绝启动；非 production 留空则回退到开发默认口令 `dev-admin-password`（账号 `admin`），让 `npm run dev` 开箱可用。 |
| `COLLECTOR_ADMIN_FORCE_RESET` | `false` | 设 `true` 时用 .env 里的口令重置管理员并作废其全部会话（忘了密码的兜底），改完记得关掉。 |
| `COLLECTOR_SESSION_TTL_HOURS` | `168` | 登录会话有效期（小时，7 天）。滑动续期：剩余不足一半时每次请求续满。 |
| `COLLECTOR_LOGIN_RATE_LIMIT` | `10` | 登录尝试限流：每个 IP 每窗口的次数上限（管理接口整体不限流，只有登录单独限流）。 |
| `COLLECTOR_LOGIN_RATE_WINDOW_MS` | `600000` | 登录限流窗口长度（毫秒）。 |
| `COLLECTOR_REGISTRATION_OPEN` | `true` | 是否允许新实例自我注册。关掉后新实例拿到 403，已注册的照常上报。 |
| `COLLECTOR_CORS_ORIGIN` | `*` | 允许的跨域来源；多个用逗号分隔。 |
| `COLLECTOR_MAX_BODY_SIZE` | `64kb` | 请求体上限（无单位的数字按字节算）。 |
| `COLLECTOR_RATE_LIMIT` | `240` | 每个来源 IP 在每个窗口内的请求数上限（查询/注册/上报共用）。 |
| `COLLECTOR_RATE_WINDOW_MS` | `60000` | 限流窗口长度。 |
| `COLLECTOR_TRUST_PROXY` | `false` | 是否信任 `x-forwarded-for`。**只在收集器确实位于可信反向代理之后时才开**，否则客户端可以自己伪造来源 IP。 |
| `COLLECTOR_SOURCE_FINGERPRINT_VOTES` | `true` | 只靠 IP+UA 指纹认出来的来源是否参与计票。 |
| `COLLECTOR_WEIGHT_INITIAL` / `_UP` / `_DOWN` / `_MIN` / `_MAX` | `1` / `1.2` / `1.5` / `0.05` / `5` | 反馈加权的基准与上下限（详见 [数据合并规则](#上报是分来源暂存的)）。 |
| `COLLECTOR_PHOTO_DRIVER` | `local` | 照片存储驱动：`local` 或 `s3`（填别的显式启动失败）。 |
| `COLLECTOR_PHOTO_LOCAL_DIR` | 库文件旁的 `photos/` | local 驱动的落盘目录。 |
| `COLLECTOR_PHOTO_PUBLIC_BASE` | 空 | 图片对外地址前缀；留空返回本站相对路径。 |
| `COLLECTOR_PHOTO_MAX_BYTES` / `_MAX_FILES` | `8mb` / `20000` | 单图上限；local 驱动下的文件总数上限。 |
| `COLLECTOR_PHOTO_ALLOW_ANONYMOUS` | `true` | 是否允许不带实例身份的匿名图片上传。 |
| `COLLECTOR_S3_ENDPOINT` / `_REGION` / `_BUCKET` / `_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` | 空 / `us-east-1` / 空 / 空 / 空 | `s3` 驱动必填四项（endpoint/bucket/ak/sk），缺一即启动失败。 |
| `COLLECTOR_S3_PREFIX` / `_FORCE_PATH_STYLE` / `_PUBLIC_BASE` | `photos/` / `true` / 空 | 对象键前缀；MinIO 等需要 path-style；直链前缀。 |
| `COLLECTOR_SYNC_TRANSPORT` | `off` | 出站同步传输：`off` / `http` / `file`（选 http 必须配 ENDPOINT、file 必须配 DIR）。 |
| `COLLECTOR_SYNC_ENDPOINT` / `_DIR` / `_TOKEN` | 空 | 推送目标地址 / file 传输目录 / 导出与导入所需令牌（留空即关闭导出接口）。 |
| `COLLECTOR_SYNC_INTERVAL_MINUTES` | `0` | 自动同步间隔；**0 = 只手动**。 |
| `COLLECTOR_SYNC_BATCH_SIZE` / `_TIMEOUT_MS` / `_MAX_ATTEMPTS` / `_INCLUDE_PHOTOS` | `200` / `10000` / `5` / `true` | 每批条目数 / 单次超时 / 重试上限 / 是否连图片一起传。 |
| `NODE_ENV` | `development` | `production` 会收紧（管理员口令必须显式配置，不再回退开发默认值）。 |

迁移到 Nuxt 之后**没有** `COLLECTOR_API_PREFIX` / `COLLECTOR_WEB_DIR`：接口路径由 `server/api/` 的目录结构决定（统一挂在 `/api/**`），页面由 Nuxt 自己提供。

## Docker 部署

镜像的构建上下文是 `collector/` 目录本身（不是仓库根）：

```bash
docker build -t homebucket-collector collector
docker run -d --name homebucket-collector \
  -p 3400:3400 \
  -v /srv/homebucket-collector:/data \
  -e COLLECTOR_ADMIN_USERNAME='admin' \
  -e COLLECTOR_ADMIN_PASSWORD='换成足够长的随机串' \
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
      COLLECTOR_ADMIN_USERNAME: admin
      COLLECTOR_ADMIN_PASSWORD: 换成足够长的随机串
      COLLECTOR_REGISTRATION_OPEN: "true"
    ports:
      - "3400:3400"
    restart: unless-stopped
```

镜像里已经设好 `COLLECTOR_DB_FILE_PATH=/data/collector.db` 与 `COLLECTOR_AUTO_MIGRATE=true`，
所以只要挂 `/data` 就能持久化，`HEALTHCHECK` 打的是 `GET /api/health`。
照片默认落在 `/data/photos/`（就在库旁边，跟着同一个卷一起备份）。

要跟上级数据库对接，再加两个变量：`COLLECTOR_SYNC_TOKEN`（导出/导入接口的令牌，
**不要**填管理员口令）与 `COLLECTOR_SYNC_TRANSPORT`（默认 `off` = 只提供导出接口、不主动外发）。

**放到公网前请做三件事**：套一层 HTTPS 反代（实例端走的是 http(s) 明文请求），
把 `COLLECTOR_TRUST_PROXY=true` 打开并确认反代确实传 `X-Forwarded-For` ——
收集器读它做限流与来源指纹，不传的话所有实例会共用一份额度、也会被认成同一个来源；
以及为收集器单独规划数据卷容量（含照片），必要时设 `COLLECTOR_PHOTO_MAX_FILES` 兜底。

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

# 详情：每个字段都带来源（谁报的、什么时候、是否被人工锁定），以及投票情况
curl http://127.0.0.1:3400/api/v1/items/6901234567890
# → { "barcode": "6901234567890", "name": "...", "fields": [ { "field": "name", "value": "...",
#      "source": "instance", "instanceId": 3, "instanceName": "书房那台", "observedAt": "...", "locked": false,
#      "voted": true, "decided": false, "voteCount": 2, "voteWeight": 2.4, "totalWeight": 3.4,
#      "candidates": [ { "value": "...", "weight": 1.2, "count": 1 }, ... ] }, ... ],
#      "imageUrls": [...], "attributes": {...}, "lockedFields": [...], "mergedIntoId": null }

# 某个条码的上报记录（审计，公开可读）
curl http://127.0.0.1:3400/api/v1/items/6901234567890/contributions

# 反馈某个来源报的值准不准（匿名可调；带实例 key 也行）
curl -X POST http://127.0.0.1:3400/api/v1/feedback \
  -H 'content-type: application/json' \
  -d '{"barcode":"6901234567890","field":"name","value":"5 号碱性电池","accurate":true,"note":"我手上就是这个"}'
# → { "recorded": true, "sourceKey": "f:…", "weight": 1.2, "upvotes": 1, "downvotes": 0 }
# 同一个来源对同一字段重复提交同一个判断 → { "recorded": false, … }（幂等，不重复加权）

# 统计概览（管理台首页那几张卡片用的就是它）
curl http://127.0.0.1:3400/api/v1/stats

# 健康检查
curl http://127.0.0.1:3400/api/health
```

照片（`POST` 是 multipart，字段名 `file`）：

```bash
# 上传一张图：按内容寻址去重，返回可长期引用的地址
curl -X POST http://127.0.0.1:3400/api/v1/photos \
  -H 'x-collector-key: hbc_...' -F 'file=@/path/to/photo.jpg'
# → 201 { "url": "/api/photos/ab/cd/abcdef….jpg", "hash": "abcdef…", "bytes": 84213, "contentType": "image/jpeg" }
# 只信 magic bytes（png/jpeg/webp/gif），不看扩展名也不看声明的 content-type

# 抓取外链图片转存到本站（实例只能给外链、又不想对方失联时用）
curl -X POST http://127.0.0.1:3400/api/v1/photos/import \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/p.jpg","sourceId":"homebucket-living-room"}'
```

上报里的 `imageUrls` 可以**混用**外链与本站地址（`/api/photos/…` 会被放行，不再当成非法相对路径）。

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

管理接口（登录后的会话 cookie，见 [管理台](#管理台)）：`/api/admin/...`。

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

### C. 与上级数据库之间（`COLLECTOR_SYNC_*` 配置）

"上级数据库"是**另一个独立项目**，接口由对方定 —— 所以这里只提供规则化的传输，
载荷格式由 `server/services/sync.service.ts` 定义并与传输解耦，换传输方式不用改业务映射。

**只有带条码的条目**会参与同步（没有条码的身份是本地指纹，换一套库就没有意义了）。
同步范围是**每次全量**：`payloadHash` 没变的条目跳过重传，`force` 可以强制覆盖。

```bash
# 对方来拉（只读导出）：需要同步令牌，不是管理员口令
curl -H 'authorization: Bearer <COLLECTOR_SYNC_TOKEN>' \
  'http://127.0.0.1:3400/api/v1/export?page=1&pageSize=200'
# → { "format": "homebucket.collector.sync/1", "generatedAt": "...",
#      "collector": { "version": "0.1.0", "dataFile": "/data/collector.db" }, "count": 12,
#      "items": [ { "barcode": "6901234567890", "name": "...", "imageUrls": [...],
#                   "attributes": {...}, "provenance": [...] } ],
#      "page": 1, "pageSize": 200, "total": 12, "hasMore": false }
# 循环拉直到 hasMore=false

curl -H 'authorization: Bearer <COLLECTOR_SYNC_TOKEN>' \
  http://127.0.0.1:3400/api/v1/export/6901234567890        # 单条；没收录是 404 item.notFound

# 对方推回来（同一套载荷格式）：顶层只要有 items 数组即可，单次最多 500 条
curl -X POST http://127.0.0.1:3400/api/v1/import \
  -H 'authorization: Bearer <COLLECTOR_SYNC_TOKEN>' -H 'content-type: application/json' \
  -d '{"sourceId":"upstream-db","items":[{"barcode":"6901234567890","name":"...","attributes":{"电压":"18V"}}]}'
# → 201 { "accepted": 1, "created": 0, "results": [ { "barcode": "...", "created": false, "itemId": 1 } ] }
```

几个刻意的取舍：

- **同步令牌不复用管理员账号**。调用方是另一套系统，不该拿到纠错台的口令 —— 对方被攻破不该等于
  收集器的纠错台被攻破。`COLLECTOR_SYNC_TOKEN` 留空时导出接口一律 401（不配就是关掉，
  不要把"内网"当安全边界）。用 `Authorization: Bearer` 或 `x-collector-sync-token` 头传。
- **推回来的数据走正常的 `contributions.create` 重放**，不直写物化列。`CatalogItem` 的字段值只能是
  上报重放的结果，绕过重放会在下一轮重放被冲掉（表现为"同步成功了但数据过一会儿变回去"）。
- **`COLLECTOR_SYNC_TRANSPORT=off` 是默认值**：只提供导出接口、不主动外发。要打开定时推送
  先确认对方能收（`COLLECTOR_SYNC_INTERVAL_MINUTES=0` 表示只手动，在"上级数据库"页面点按钮）。
- 每条同步都有账本（`OutboundSync`）：状态、尝试次数、最后错误、对方的 id。失败按指数退避重试，
  超过 `COLLECTOR_SYNC_MAX_ATTEMPTS` 就留在失败清单里，界面上一眼能看见。

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

### 上报是分来源暂存的

上面那套"最新非空观测胜出"是**回退口径**：每条上报都会先按来源单独存下来（`ItemObservation`
一行 = 某来源对某物品某字段的一次证据），能计票时才按投票决定下发什么。

**投票**（`server/utils/voting.ts`，纯函数、随机源可注入）：

- 每个来源对每个字段**只持一票**。同一个来源先报 A 后报 B，只算它最后报的那个值 ——
  否则一个来源改口一次就能给自己多投一票。
- 按**权重和**排序，权重相同才看票数，再相同取最早报出的值。
  所以"反馈能改变下发结果"是靠权重生效的，不是靠票数。
- 只有唯一最高票（无并列、或权重/票数分出高下）时才 `decided`；
  没有最高票时**按权重随机下发**其中一个被上报的值 —— 这里绝不编造一个值，
  随机只在"真的报上来的那几个"之间选。

**反馈加权**：

- `POST /api/v1/feedback` 收"某个来源在某物品某字段上报的值准不准"，匿名可调。
- 权重 = `initial × up^好评数 ÷ down^差评数`，再夹到 `[min, max]`（默认 1 / 1.2 / 1.5 / 0.05 / 5，
  见 `COLLECTOR_WEIGHT_*`）。这是权重**唯一**的写入路径 —— 改判时按全部反馈重算，
  不在旧值上做增量（改判要能反向纠回来）。
- 好评、差评都按「一个来源对一个字段只有一票」去重：甲说乙不对、丙也说乙不对，只算乙一次差评。
  所以界面上的"好评数"是**被认可的字段数**，不是"收到过几条好评"。

**来源身份**：上报全是匿名的，投票身份只能从请求推导 —— 自报 ID
（`x-collector-source` 头 / 请求体 `sourceId` / `?source=`）优先，否则退回 IP + User-Agent 指纹
（只存 sha256）。两种都认不出来时该上报仍会入库、仍进审计，但**不参与投票**。

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

浏览器打开收集器地址（生产形态即 `http://<host>:3400/`）。界面按 Design.md 的风格规范做了统一
（单一蓝色强调色 + 中性灰、系统字体栈、内联 SVG 图标、class 驱动的明暗模式、文案全部走
`@nuxtjs/i18n` 且顶栏可切换中/英），外壳是左侧 256px 固定侧栏 + 顶部 64px 栏，窄屏收成抽屉。

| 页面 | 需登录 | 作用 |
| --- | --- | --- |
| 查询 `/` | 否 | 按条码/关键字搜物品，看详情 |
| 详情 `/items/:barcode` | 否 | 每个字段的值 + **来源**、观测时间、锁定状态，以及**投票情况**（票数/权重、是否已判出最高票） |
| 统计 `/stats` | 否 | 物品/上报/实例总量与近期趋势（聚合 SQL 实时算，不落汇总表） |
| 审计 `/audit` | 是 | 所有上报记录，可按实例 / 物品 / 来源 / 是否被屏蔽筛选，单条屏蔽或恢复 |
| 纠错台 `/admin` | 是 | 改字段（可同时锁定）、显式清空字段、屏蔽上报、合并重复条目、封禁/解封实例 |
| 来源管理 `/sources` | 是 | 每个上报来源的权重、好评/差评、证据数；可手改权重（会被下次自动重算覆盖） |
| 上级数据库 `/upstream` | 是 | 待同步/已同步/失败清单、上行载荷预览（含图片）、手动触发同步 |
| 登录 `/login` | — | 独立单页，不套应用外壳 |
| 改密码 `/password` | 是 | 当前口令 + 新口令 |

页面是 Nuxt SSR（公开页）+ Tailwind v4 + Nuxt UI v4，深色模式用 `@nuxtjs/color-mode`
（`.dark` class，跟随系统，可手动切换）。

**未登录时的拦截是服务端 302**：受保护路由由全局中间件 `app/middleware/login-gate.global.ts`
在 SSR 阶段直接 `sendRedirect` 到 `/login?redirect=<原路径>`，**页面内容一帧都不渲染**（不是
"先渲染再跳"）。公开页 `/`、`/stats`、`/items/*` 以及 `/api/*`、`/_nuxt/*` 不在拦截范围内。
客户端侧另有 `useAuthGate()` 兜一道（处理会话中途失效），确认未登录时同样跳登录页。

### 登录与账号

纠错台/审计/来源管理/上级数据库/改密码这几个页面要登录才能用（公开查询与统计不需要）：
未登录访问会由服务端 302 跳到 `/login?redirect=<原路径>`，登录后回跳原页；
登录后侧栏底部出现账号区（**修改密码** / **退出登录**）。

开发环境（非 `NODE_ENV=production`）不配 `COLLECTOR_ADMIN_PASSWORD` 也能直接登录：账号 `admin`、口令 `dev-admin-password`。

- 账号在**首次启动、库里还没有管理员时**按 `COLLECTOR_ADMIN_USERNAME` / `COLLECTOR_ADMIN_PASSWORD` 创建
  （启动日志会写"已按 .env 创建管理员账号 …"）。
- 口令以 **scrypt** 哈希存库（`scrypt$N$r$p$salt$hash`，参数写在哈希串里，以后调参数不会锁死老账号）。
- 登录成功后服务端发 `hb_collector_session` cookie：**httpOnly**（JS 读不到，XSS 偷不走）、SameSite=Lax
  （跨站 POST 不带它，管理接口因此天然免疫 CSRF）、Path=/、生产走 https 时自动加 Secure。
  库里只存这个 cookie 值的 sha256 —— 即使库文件泄露也拿不到可用的令牌。
- 会话**滑动续期**：剩余不足一半时，每次带 cookie 的请求把它续到满（`COLLECTOR_SESSION_TTL_HOURS`）。
- 改密码要带当前口令，成功后**其它设备上的会话全部作废**（只留当前这条）。

**忘了密码**：把 `COLLECTOR_ADMIN_FORCE_RESET=true` 写进 `.env` 重启一次，就会用 .env 里的口令重置，
并作废该账号的全部会话；然后**记得把这个开关关掉**，否则每次重启口令都被 .env 覆盖回去。
已有账号时 .env 里的口令**不会**生效 —— 否则界面上改过的密码会被下次重启悄悄改回去。

```bash
# 登录（cookie 存到 /tmp/cj.txt，后续请求带上它）
curl -c /tmp/cj.txt -X POST http://127.0.0.1:3400/api/admin/login \
  -H 'content-type: application/json' -d '{"username":"admin","password":"<口令>"}'
# → { "ok": true, "user": { "id": 1, "username": "admin", ... }, "expiresAt": "..." }

curl -b /tmp/cj.txt http://127.0.0.1:3400/api/admin/session
# → { "ok": true, "scope": "admin", "version": "0.1.0", "registrationOpen": true,
#      "user": { "id": 1, "username": "admin", "lastLoginAt": "...", ... } }

curl -b /tmp/cj.txt -X POST http://127.0.0.1:3400/api/admin/logout      # → { "ok": true, "revoked": true }

curl -b /tmp/cj.txt -X POST http://127.0.0.1:3400/api/admin/password \
  -H 'content-type: application/json' \
  -d '{"currentPassword":"<旧口令>","newPassword":"<新口令>"}'    # → { "ok": true, "revokedSessions": 2 }
```

未登录/会话过期的错误码：`admin.sessionMissing`（没带 cookie）、`admin.sessionInvalid`（令牌不存在或已被吊销）、
`admin.sessionExpired`（过期，行会被顺手删掉）；口令错是 `admin.badCredentials`（与"用户不存在"同一个 code，
不给账号枚举留接口）；登录尝试过多是 `rate.tooMany`（带 `retryAfterSeconds`）。
改密码另有：`admin.badCurrentPassword`（当前口令不对）、`admin.passwordUnchanged`（新旧口令相同）、
新口令太短是 `validation.failed`（带 `fields`）——这三个都返回 400。

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

GET    /api/admin/sources?page=&suspicious= # 来源列表（权重升序，可疑的在前）
GET    /api/admin/sources/:key              # 来源详情（近期证据 + 收到的反馈）
POST   /api/admin/sources/:key/weight       # { weight } 手改权重（会被下次自动重算覆盖）

GET    /api/admin/sync                      # 同步总览：配置 + 计数 + 账本
GET    /api/admin/sync/:id                  # 单条上行载荷预览（含图片）
POST   /api/admin/sync/:id/reset            # 把这条的账本清回待同步
POST   /api/admin/sync/run                  # { force, limit } 手动触发一轮同步
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
│   ├── api/admin/       # 纠错台（登录会话）
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

- `test:e2e` 也可以用 `COLLECTOR_BASE=http://127.0.0.1:3400 COLLECTOR_ADMIN_USERNAME=admin COLLECTOR_ADMIN_PASSWORD=…`
  打一个**已经在跑**的实例；那种用法要求目标库是**全新的**（脚本会灌一套自己的样例数据并断言条数），
  所以先删掉库文件再跑，而且目标实例的登录限流窗口会被脚本最后那个 429 用例打满
  （自拉进程时脚本把 `COLLECTOR_LOGIN_RATE_LIMIT` 压到 5 次/分钟，所以那个用例很快）。
  它覆盖的是"契约级"行为：25 条路由的状态码与响应形状、字段级合并规则、锁定/屏蔽/合并/封禁后的重放、
  老契约（`GET /api/v1/barcodes/:code` + `POST /api/v1/observations`）的向后兼容、SSR 首屏与静态资源 MIME、
  账号口令登录（会话 cookie / 伪造令牌 / 改密码吊销其它会话 / 登出 / 登录限流）、CORS 与预检、未知接口回 JSON 404。
  这些正是单测盯不到的"接缝"，所以发版前必跑。

- TypeORM 实体用 **`EntitySchema`** 而不是装饰器：Nitro 用 esbuild 打包，esbuild 不支持
  `emitDecoratorMetadata`，装饰器实体会丢掉列类型（详见 `server/database/entities.ts` 的注释）。
- 迁移文件与实体的列/索引定义必须逐字一致，否则 `db:check-drift` 会失败；索引名沿用第一版迁移生成的名字。
- 时间戳一律以 ISO 字符串存在 `varchar` 列里：字典序就是时间序，绕开不同驱动的日期类型差异。
- 中文长注释写"为什么"，不写"是什么"。
