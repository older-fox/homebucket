# Homebucket

[English](./README.md) | **简体中文**

> **HomeBox 的升级替代**：把「每样东西放在哪里」记清楚的自托管收纳归档工具。

## 项目介绍

**Homebucket 是 [HomeBox](https://github.com/hay-kot/homebox) 的现代化替代方案**（独立项目，与 HomeBox 官方无隶属关系）：沿用「位置树 + 物品台账」的思路，但基于当前技术栈重写，并针对多成员家庭、序列号追踪、条码与移动端这些场景做了补强。

从 HomeBox 过来的人，可以重点关注这些差异：

- **多成员家庭**：注册即建个人家庭，可通过邀请链接加入别人的家庭；一个用户可同时属于多个家庭并随时切换，所有数据按 `familyId` 强制隔离，角色分 owner / admin / member。
- **同一物品的多个序列号可以分散在不同位置**：同型号两台落地风扇，一台在储藏室、一台在卧室，各自登记 SN 与位置。
- **模板 + 条码闭环**：模板可绑定商品条码，扫码即套用；新增物品时条码字段置顶。
- **条码数据收集（可关）**：内置一个可选的「条码 → 商品信息」收集客户端，扫到新条码可自动补全名称/厂商/型号。
- **开箱即用的多语言**：主中文、次英文，翻译是独立 JSON，社区可直接提交新语言。
- **单容器部署**：一个镜像同时跑前后端，前端经内置代理访问后端，天然同源无跨域。
- **两种数据库共用一个模型**：MySQL 与 SQLite（“MySQL light”）共用同一套手写 TypeORM 实体——表结构与行为一致，只有驱动不同。

家里东西一多，就会反复出现「这东西到底收哪了」。Homebucket 用**位置树 + 物品台账**回答这个问题：每件物品记录它所在的位置、数量、价值，还可以为同一件物品的多个序列号（SN / 条码）分别指定位置——同型号的两台落地风扇，一台在储藏室、一台在卧室，也能各归各位。

### 核心概念

| 概念 | 说明 |
| --- | --- |
| **家庭（Family）** | 数据边界。注册即自动创建个人家庭；接受邀请后可拥有多个家庭并随时切换。所有查询强制按 `familyId` 隔离，只有家庭所有者能管理成员与邀请链接。 |
| **位置（Location）** | 可任意层级的树（玄关/客厅/主卧/储藏室/车库…），支持拖拽排序与跨层移动，可上传照片、生成二维码。 |
| **物品（Item）** | 收纳台账的基本单位：名称、描述、数量、单价、型号、制造商、位置、标签、照片、商品条码，以及可选的系统追溯码。 |
| **序列号（ItemUnit）** | 需要逐件追踪的物品可登记多个 SN，**每个 SN 可以位于不同位置**。 |
| **标签（Tag）** | 跨位置的横向分类，书签式展示。 |
| **模板（Template）** | 常用物品的预置信息，新增物品时一键套用；模板也可绑定商品条码，扫码即套用。 |
| **通知器（Notifier）** | SMTP / Google Chat / Telegram / Discord / 钉钉 / 飞书 / 企业微信 / Bark / Server 酱，按事件订阅并可测试发送。 |
| **扫码** | 二维码生成 + 摄像头扫码 + 图片识别 + 手动/扫码枪；解析优先级：**商品条码 → 物品/位置二维码 → SN**。 |

### 功能亮点

- **单容器部署**：一个 Docker 容器同时跑 Nest 后端与 Nuxt 前端，前端通过内置代理访问后端，天然同源、无跨域。
- **零外部依赖运行**：字体、图标、Logo 全部自托管（本地 woff2 + 本地 lucide 图标集），内网/离线可用。
- **启动即迁移**：空库首次启动自动建表，并按 `DEFAULT_ADMIN_*` 创建管理员。
- **多语言**：主中文、次英文，翻译文件独立可社区提交；后端只回机器可读 `code`。
- **真移动端适配**：底部 Tab + 扫码中枢、位置钻取式导航、左滑快捷操作、页面内滚动布局，不是简单重排版。
- **两种数据库**：MySQL（默认）与 SQLite（“MySQL light”），共用同一套 TypeORM 实体。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 后端 | NestJS 12.1 + TypeORM 1.1（`@nestjs/typeorm` 12），Express 5 |
| 前端 | Nuxt 4.6（Vue 3.5）+ Nuxt UI v4 + Tailwind v4，SSR |
| 数据库 | MySQL（默认，`mysql2`）/ SQLite（“MySQL light”，`better-sqlite3`） |
| 部署 | 单 Docker 容器（多阶段构建）；GitLab CI 用 kaniko 在容器内构建并推送镜像 |

**非 monorepo**：`server/` 与 `web/` 是两个完全独立的 npm 包，各有自己的 `package.json` 和 `node_modules`。仓库根目录只放环境变量、Dockerfile、CI 与文档。

**运行环境与版本**：Node **24** LTS（NestJS 12 与 Nuxt 4.6 都要求 `^22.22.3 || ^24.15.0`）。NestJS 12 的包是纯 ESM，但后端仍以 CommonJS 运行（靠 Node 的 `require(esm)` 支持）。`typescript` 固定为 `~6.0.3`：TypeScript 7 只提供 `tsc` 二进制、不再提供 Nest CLI 需要的编译器 API（`nest build` 会直接拒绝），所以 6.0.3 是当前可用的最新版本。TS 6 还要求 `tsconfig.json` 显式写 `"rootDir": "./src"`（否则产物会变成 `dist/src/main.js`）与 `"types": ["node", "express", "multer"]`（TS 6 不再隐式加载全部 `@types`，否则 `@types/multer` 的 `Express.Multer` 全局声明不生效）。

## 目录结构

```
.
├── .env / .env.example      # 环境变量（.env 已 gitignore，前后端共用）
├── Dockerfile               # 多阶段构建，运行期单容器同时跑前后端
├── docker-entrypoint.sh
├── .dockerignore
├── .gitlab-ci.yml           # kaniko 镜像流水线（容器内构建 → 推项目容器注册表）
├── server/                  # NestJS + TypeORM
│   ├── scripts/
│   │   ├── db-baseline.mjs          # 把已有（Prisma 时代）的库登记为已执行 Init
│   │   └── seed.mjs                 # 演示数据
│   └── src/
│       ├── main.ts  app.module.ts
│       ├── config/env.ts            # 所有配置项（惰性读取 process.env）
│       ├── config/bootstrap-admin.ts# 空库首次启动创建管理员
│       ├── common/                  # 家庭上下文守卫、参数装饰器、校验归一化
│       ├── logger/                  # 应用日志 + nginx 风格访问日志
│       ├── entities/                # 11 个实体类（唯一来源）+ index.ts + transformer
│       ├── database/                # data-source / DatabaseModule / auto-migrate / migrations/{mysql,sqlite}
│       ├── auth/                    # 注册 / 登录 / me（用户名 + 密码，JWT）
│       ├── families/                # 家庭、成员、邀请链接
│       ├── locations/               # 位置树（拖拽由服务端裁决）
│       ├── items/                   # 物品 + SN 单元 + CSV 导出
│       ├── tags/                    # 标签
│       ├── templates/               # 模板与「用模板建物品」
│       ├── uploads/                 # 上传（local / S3 抽象）
│       ├── collection/              # 条码数据收集客户端
│       ├── notifiers/               # 通知器（SMTP / Telegram / 钉钉 …）
│       │   └── channels/            # 每个渠道一个文件（smtp / telegram / dingtalk …）
│       ├── dashboard/  search/  scan/
│       └── ...                      # 每个域统一为 <domain>.module.ts + .controller.ts + .service.ts（+ dto.ts）
└── web/                     # Nuxt 4 + Nuxt UI v4 + Tailwind v4
    ├── nuxt.config.ts               # 监听地址、/api 代理、i18n、图标
    ├── i18n/locales/{zh-CN,en}.json # 翻译文件（唯一翻译源，社区可提交）
    ├── i18n/README.md               # 新增语言指引
    ├── public/logo.svg
    └── app/                         # Nuxt 4 应用目录
        ├── app.vue  app.config.ts
        ├── assets/css/main.css      # Tailwind + 设计令牌
        ├── layouts/{default,auth}.vue
        ├── middleware/auth.global.ts
        ├── composables/             # useApi useAuth useFamily useFormat useNav
        │                            # useBreakpoint useLocations useTreeExpansion
        ├── components/              # SearchBox SwipeRow ListPager ListSkeleton
        │                            # LocationTree LocationDetail LocationDialogs
        │                            # ItemForm UnitEditor TagPicker LocationPicker
        │                            # PhotoUploader PageHeader EmptyState 等
        ├── types/location.ts
        └── pages/                   # index / login / register / locations[index,[id]]
                                     # items[index,new,[id]] / templates / settings
                                     # search / scan / invite/[token] / r/[code]
```

## 快速开始

```bash
# 1) 准备环境变量
cp .env.example .env      # 至少填 DATABASE_URL（或改用 sqlite）

# 2) 后端
cd server
npm install
npm run db:run            # 应用迁移（空库会一次建好全部表）
npm run start:dev         # http://localhost:3001/api
                          # （AUTO_MIGRATE=true 启动时也会自动迁移，db:run 可省）

# 3) 前端（另开一个终端）
cd web
npm install
npm run dev               # http://<本机IP>:3000
```

接口：`GET /api`（信息）、`GET /api/health`（健康检查）、`POST /api/auth/register`（用户名 + 密码，邮箱选填）、`POST /api/auth/login`（**用户名** + 密码）、`GET /api/auth/me`（需 `Authorization: Bearer <token>`）。

想直接看效果：`cd server && npm run build && npm run seed`（见下方「演示数据」）。

## 配置

全部配置集中在根目录 `.env`，前端构建/运行与后端进程共用。

### 通用 / 数据库

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `development` | 运行环境 |
| `DB_PROVIDER` | `mysql` | `mysql` 或 `sqlite`（“MySQL light”，无需数据库服务） |
| `DATABASE_URL` | — | `mysql://user:pass@host:3306/db`；**不要加引号**（见下方注意）。各项还可用 `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` 单独覆盖 |
| `AUTO_MIGRATE` | `true` | 进程启动时在进程内执行 TypeORM 迁移（空库首次启动自动建表） |
| `DB_FILE_PATH` | `./data/homebucket.db` | sqlite 库文件路径，相对 `server/` 解析；兼容历史的 `file:` 前缀（Docker 内用 `/data/homebucket.db`） |

### 后端 Nest

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `SERVER_PORT` | `3001` | 后端监听端口 |
| `API_PREFIX` | `api` | 路由前缀 |
| `CORS_ORIGIN` | `*` | 允许跨域的来源，多个用逗号分隔 |
| `MAX_UPLOAD_SIZE` | `1gb` | 请求体 / 上传上限，支持 `1024` / `10mb` / `1gb` |

### 日志

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `LOG_LEVEL` | `info` | `error` / `warn` / `info` / `debug` / `verbose` |
| `LOG_FORMAT` | `pretty` | `pretty`（彩色）/ `json`（单行 JSON）/ `nginx`（nginx 风格） |
| `LOG_ACCESS` | `true` | 是否输出 nginx combined 风格访问日志 |

### 数据目录与文件存储

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATA_DIR` | `./data` | 数据根目录（Docker 内为 `/data`，挂卷持久化） |
| `UPLOAD_DIR` | `${DATA_DIR}/uploads` | 上传目录，留空自动推导；local 模式由 `/api/media/<key>` 提供 |
| `STORAGE_DRIVER` | `local` | `local` 落本地磁盘；`s3` 走 S3 兼容对象存储 |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_FORCE_PATH_STYLE` | — | S3 配置（`STORAGE_DRIVER=s3` 时生效） |
| `DEFAULT_CURRENCY` | `CNY` | 新家庭默认主货币（金额只使用家庭主货币） |
| `DEFAULT_LOCALE` | `zh-CN` | 默认语言（家庭设置里可覆盖） |
| `PUBLIC_BASE_URL` | 空 | 二维码写入的站点根地址，如 `http://192.168.1.10:3000`；留空则二维码只含 token |

### 首次初始化 / 默认管理员

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `AUTO_CREATE_ADMIN` | `true` | 空库首次启动是否自动创建管理员 |
| `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD` / `DEFAULT_ADMIN_EMAIL` | `admin` / `admin` / `admin@example.com` | 首次初始化（空库启动或 `npm run seed`）使用的管理员；**登录用用户名**，邮箱仅作记录。正式环境务必修改 |

### 条码数据收集

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATA_COLLECTION_ENABLED` | `true` | 总开关；关闭后本实例不向外部发送任何请求 |
| `DATA_COLLECTION_ENDPOINT` | 占位地址 | 收集服务地址（**独立项目**，需替换成你自己的） |
| `DATA_COLLECTION_SUBMIT` | `true` | 是否把本实例填写的条码信息回传 |
| `DATA_COLLECTION_TIMEOUT_MS` | `1500` | 请求超时，超时静默降级 |

### 认证

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `JWT_SECRET` | — | 登录凭证签名密钥（正式环境务必改） |
| `JWT_EXPIRES_IN` | `7d` | 凭证有效期 |
| `ALLOW_REGISTRATION` | `true` | 是否开放注册；为 `false` 时拒绝所有注册请求（含凭邀请链接注册），已有账号照常登录，前端注册入口会自动隐藏 |

### 前端 Nuxt

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `WEB_HOST` | `0.0.0.0` | 监听 IP，`0.0.0.0` 表示局域网/容器外可访问 |
| `WEB_PORT` | `3000` | 监听端口 |
| `NUXT_PUBLIC_API_BASE` | `/api` | 浏览器访问后端地址（默认同源代理） |
| `NUXT_API_BASE` | `http://127.0.0.1:3001/api` | SSR 时访问后端地址 |
| `API_PROXY_TARGET` | `http://127.0.0.1:3001` | Nuxt 代理 `/api` 的目标 |

> 改 `.env` 后需重启进程；`LOG_*` 与端口类配置在启动时读取。
>
> **注意**：`docker run --env-file .env` **不会**去掉值两侧的引号，所以 `DATABASE_URL`、`DB_FILE_PATH` 等不要加引号。

## 数据库与迁移

### 一套实体，两个 provider

数据模型就是 `server/src/entities/*.entity.ts` 里的**手写实体类**（共 **11 个**，清单见 `server/src/entities/index.ts`），同一套实体同时驱动 MySQL 与 SQLite。数据访问通过注入的 `Repository<T>`（`@InjectRepository`）：全局 `DatabaseModule` 导出了 `TypeOrmModule.forFeature(entities)`，业务模块直接注入仓库即可，不必每个模块重复写一遍 `forFeature` 清单。

`entities/index.ts` 顶部记录的三条跨 provider 约定（改实体时务必遵守）：

| 约定 | 原因 |
| --- | --- |
| 显式写 `@Entity('TableName')` | TypeORM 默认命名策略是 snake_case（`ItemUnit` → `item_unit`），而现有表名是驼峰；不显式指定会直接读不到表 |
| `@CreateDateColumn` / `@UpdateDateColumn` 不传 `precision` | `{ precision: 3 }` 会让 TypeORM 生成 `datetime(3) ... DEFAULT CURRENT_TIMESTAMP(6)`，MySQL 直接报 “Invalid default value”；`@UpdateDateColumn` 随后报 “Invalid ON UPDATE clause”。裸写法由 TypeORM 按 provider 生成合法 DDL，且 insert/update 时都会在 JS 侧赋值 |
| 金额列挂 `decimalNumber` transformer | `mysql2` 会把 `DECIMAL` 读成字符串，SQLite 读成 number；transformer 让两边都得到 JS `number` 类型的 `price` |

另外刻意不用 enum / Json / BigInt（SQLite 不支持）：枚举值统一用字符串加注释说明，JSON 用字符串存。

SQLite 驱动是 **`better-sqlite3`**（固定 `13.x`）——TypeORM 1.x 里已经没有 `type: 'sqlite'`。它的预编译产物直接打在 npm 包内，安装时不需要编译器、也不需要访问 GitHub；镜像用 `--ignore-scripts` 安装，顺带避开了该包会隐式触发的 `node-gyp rebuild`。

### 迁移：两个目录、四个文件

MySQL 与 SQLite 的 DDL 差别很大（自增、类型名、ALTER 语法、时间默认值都不一样），一套迁移脚本不可能两边都跑通，所以实体共享、迁移各存一份：

| Provider | 目录 | 迁移 |
| --- | --- | --- |
| MySQL | `server/src/database/migrations/mysql/` | `Init`、`NormalizeFromPrisma`、`RenamePrismaFkIndexes` |
| SQLite | `server/src/database/migrations/sqlite/` | `Init` |

npm 脚本（取代原来的 `prisma:*`）：

| 脚本 | 作用 |
| --- | --- |
| `npm run db:generate` | 依据实体 `migration:generate`，需要带上目标路径：`npm run db:generate -- src/database/migrations/mysql/AddThing` |
| `npm run db:run` | `migration:run` |
| `npm run db:revert` | `migration:revert`（一次回退一个迁移，注意下方警告） |
| `npm run db:show` | `migration:show`（`migrations` 表内容） |
| `npm run db:baseline` | 把已有 Prisma 时代的库登记为已执行（见下方升级一节） |
| `npm run seed` | 演示数据 |

`db:generate` / `db:run` / `db:revert` / `db:show` 用 `typeorm-ts-node-commonjs` 加 `-d src/database/data-source.ts`，跑的是 `src/`。`db:baseline` 与 `seed` 跑的是编译产物 `dist/`，所以必须先 `npm run build`——这也正是它们能在“只有生产依赖”的运行期镜像里直接用的原因。

迁移是按 provider 分开的，所以生成时要把路径写到对应目录下（`src/database/migrations/mysql/...` 或 `.../sqlite/...`）。

> **⚠️ `db:revert` 不能用来“撤销 `db:baseline`”。** baseline 只是往 `migrations` 表插了一条记录——TypeORM 并不知道 `Init` 从没真正执行过，所以 revert 会去执行 `Init.down()`，而它期望的是 TypeORM 命名的外键。在老库上这会以 `Can't DROP ... FK_<hash>; check that column/key exists` 失败；由于 `Init.down()` 先删外键、`DROP TABLE` 放在最后，它会在删除任何表之前就中断，所以表和 数据都还在。要回到 Prisma 时代的结构，请用备份 dump 恢复。而在**全新安装**的库上（`Init` 真的执行过），revert `Init` 是真正的拆除动作，**会删表**，这是迁移的正常语义。

### 升级已有的 Prisma 时代数据库

这是唯一需要留意的运维变更。老库的表都在（Prisma 建的），但没有 TypeORM 的 `migrations` 记录表，直接 `migration:run` 会试图重新建表并失败。

1. `npm run db:baseline` —— 建出 TypeORM 的 `migrations` 表并把 `Init` 登记为“已执行”，**不跑任何 DDL**（表本来就在）。它对没有任何业务表的库会拒绝执行（那是全新安装，直接跑迁移即可），并且刻意把增量迁移留作待执行。
2. `npm run db:run` —— 应用 `NormalizeFromPrisma` 与 `RenamePrismaFkIndexes`。

这两个增量迁移只对 Prisma 时代的老库有意义：

- **`NormalizeFromPrisma`** 会在全新安装的库上**自动跳过**（先探测 Prisma 命名的外键），否则执行：把 `Item.price` / `Template.price` 的 `decimal(65,30)` 收紧成 `decimal(12,2)`；把 `createdAt` / `updatedAt` 的 `datetime(3)` 放宽成 `datetime(6)`；并给 `updatedAt` 列补上数据库默认值与 `ON UPDATE`。
- **`RenamePrismaFkIndexes`** 把 13 个 Prisma 命名的外键支撑索引（`<表>_<列>_fkey`）改名为 TypeORM 的 `FK_<hash>`，让后续 `migration:generate` 不再产生漂移。MySQL 不允许删除这些索引（外键需要它们），所以是改名而不是删除。

Prisma 的 `_prisma_migrations` 表**刻意保留不动**：已经没有代码读它，确认无误后可以手动删掉。整条升级路径（baseline，再跑两个增量迁移）不会丢数据，完成后库结构与全新安装一致。

**全新安装**没有任何额外步骤：空库会在首次启动时或 `npm run db:run` 时由 `Init` 一次建好全部表。

### 启动即迁移

后端启动时（`AUTO_MIGRATE=true`，默认开）会先**在进程内**执行 TypeORM 的迁移器（`src/database/auto-migrate.ts`，在 Nest 创建之前），不再 shell out 到 Prisma CLI——这正是运行期镜像能只带生产依赖的原因：

- 空库首次启动自动建表，不会再出现“表不存在导致启动失败”；
- 幂等，已应用的迁移不会重复执行（二次启动会打印 `[migrate] provider=… 没有待执行的迁移`）；
- 失败只打 `[migrate]` 错误日志、不阻断进程，`/health` 会显示 `degraded`；数据库连不上也不中断启动。

想自己控制节奏：`AUTO_MIGRATE=false`，手动 `cd server && npm run db:run`。

**空库首次启动**还会按 `DEFAULT_ADMIN_*` 自动创建管理员（`AUTO_CREATE_ADMIN=false` 可关），日志会打印账号，登录后请尽快改密码。

### SQLite（MySQL light）

```bash
# .env
DB_PROVIDER=sqlite
DB_FILE_PATH=./data/homebucket.db   # 相对路径按 server/ 解析；兼容历史的 "file:" 前缀
```

然后 `npm run db:run`（或直接启动后端）即可。用默认路径时库文件落在 `server/data/homebucket.db`（已 gitignore）；Docker 里请用 `DB_FILE_PATH=/data/homebucket.db`。

## Docker（单容器）

多阶段构建：`base → server-build → server-prod-deps → web-build → runtime`，按需 `COPY`（不使用 `COPY . .`），`.dockerignore` 排除 `node_modules` / `dist` / `.output` / `.nuxt`。运行期一个容器同时起 Nest（`:3001`）与 Nuxt（`:3000`），前端通过代理访问后端。

```bash
DOCKER_BUILDKIT=1 docker build \
  --build-arg NODE_IMAGE=docker.1ms.run/library/node:24-bookworm-slim \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  -t homebucket .

docker run -d --name homebucket --env-file .env -v hb-data:/data -p 3000:3000 homebucket
```

- 容器内数据统一放 `/data`（sqlite 库文件 + 上传图片），`VOLUME ["/data"]`，挂卷即可持久化；通常只需暴露 3000。
- 数据库迁移由后端进程启动时自动完成（TypeORM 迁移器，进程内执行）。
- 基础镜像为 `node:24-bookworm-slim`。原来的 `openssl` apt 层**已删除**（它当年只为 Prisma 查询引擎而存在），随之去掉的还有 `APT_MIRROR` 构建参数与 apt 源改写。
- `DB_PROVIDER` **构建参数已删除**：镜像与 provider 无关——`mysql2` 与 `better-sqlite3` 都是生产依赖，驱动由运行期的 `DB_PROVIDER` 环境变量决定。`prisma generate` 构建步骤也不存在了。
- npm 安装使用 BuildKit 缓存挂载（`# syntax=docker/dockerfile:1`、`RUN --mount=type=cache,target=/root/.npm`），因此需要启用 BuildKit 的 Docker；旧版环境请设 `DOCKER_BUILDKIT=1`（或升级 Docker）。
- 运行期阶段拷贝的是**只含生产依赖**的 `node_modules`：单独的 `server-prod-deps` 阶段执行 `npm ci --omit=dev --ignore-scripts`。对 `better-sqlite3` 安全，因为它的预编译 binding 直接从包里加载；`--ignore-scripts` 同时避开 slim 镜像里没有工具链的隐式 `node-gyp rebuild`。前端 `.output` 自包含，运行期不带 `web/node_modules`。
- `NODE_IMAGE` / `NPM_REGISTRY` 都是加速用构建参数，本地默认走官方源即可不传。

## CI（GitLab + kaniko）

`.gitlab-ci.yml` 分两个 stage：`check` → `image`（`check` 全绿才进镜像构建）。

**`check:types`**（stage `check`，push 任意分支 / 页面手动触发都会跑）：普通 Node 容器，把本地那套检查原样跑一遍 —— 两个包各自 `npm ci`，两边各跑 `npm run typecheck`，server 侧再跑 `npm run db:check-drift` 与 `npm test`。类型错误、结构漂移、契约回归都在这里几分钟内拦住，不必等（慢得多的）镜像构建；MySQL 覆盖不到，因为需要外部实例（`db:check-drift` 改为对一次性 SQLite 文件跑迁移 + `schema:log`）。

server 的安装在 CI 里必须写成 `npm ci --ignore-scripts`：`better-sqlite3` 的 npm 包带 `binding.gyp` 却没有 install 脚本，npm 会按默认行为补跑一次 `node-gyp rebuild`，而基础镜像是 slim 版（既没有 Python 也没有编译器），会以 `gyp ERR! find Python … Could not find any Python installation to use` 直接失败；跳过安装脚本即可 —— 运行期 `lib/binding.js` 直接加载包内 `prebuilds/*.node`，不需要 `build/` 目录。Dockerfile 里两处 server 安装出于同样原因也带着这个参数，改 CI 时别把它漏掉（`server/test/ci-install-scripts.test.mjs` 会盯着）。

**`docker:image`**（stage `image`）：

- **整个 job 在容器内执行**：使用 kaniko executor（debug）镜像，不需要 docker daemon / dind，也不需要 privileged runner。
- **编译在 `docker build` 内部**（`nest build` / `nuxt build`）：失败即 job 失败。
- **零 artifacts**：构建结果只以镜像形式推送到**项目的容器注册表**（`$CI_REGISTRY_IMAGE`）。
- **tag 策略**：始终推 `sha-<short>`；推送默认分支额外推 `latest`；打 tag 额外推版本号；其它分支额外推分支名 slug。
- **触发**：push 任意分支 / 打 tag / 页面 Run pipeline / API。

加速域名（可在 CI/CD Variables 覆盖）：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NODE_IMAGE` | `docker.1ms.run/library/node:24-bookworm-slim` | 基础镜像（Docker Hub 加速） |
| `NPM_REGISTRY` | `https://registry.npmmirror.com` | npm 源 |

kaniko 镜像本身在 gcr.io，走 `gcr.m.daocloud.io/kaniko-project/executor:debug` 加速（`docker.m.daocloud.io` 是 Docker Hub 的加速域名，没有这个仓库，会报「不在白名单」）。构建使用 `--cache=true --cache-repo "$CI_REGISTRY_IMAGE/cache"`，外加 `--snapshot-mode=redo` 与 `--use-new-run`（针对 `node_modules` 海量文件加速快照）；若注册表禁用了子仓库，去掉 `--cache` 两行即可。注意当前这个 kaniko 版本会解析但**忽略** BuildKit 的 `--mount=type=cache`，所以 npm 缓存挂载只在本机 BuildKit 构建时才有收益。

## 跨域是怎么解决的

前端 `WEB_HOST=0.0.0.0` 对外后，浏览器可能用 `localhost`、`127.0.0.1`、局域网 IP、域名等来源访问，靠白名单穷举不可靠。因此：

1. Nuxt 用 nitro `routeRules` 把 `/api/**` 代理到后端（`API_PROXY_TARGET`），浏览器始终**同源**请求 `/api`；
2. 后端另外开 `CORS_ORIGIN`（默认 `*`）并放行 `Authorization` 头，方便直连 `:3001` 调试或第三方调用。

## 前端说明（Nuxt 4）

- 应用代码在 `web/app/`：`pages` / `components` / `composables` / `layouts` / `middleware` / `assets` / `types`；`nuxt.config.ts`、`public/`、`i18n/` 留在 `web/` 根下。
- 图标使用本地图标集 `@iconify-json/lucide`，不依赖 Iconify 在线服务；`@nuxt/icon` 的接口改到 `/_nuxt_icon`，否则会被 `/api/**` 代理转发给 Nest 导致图标全部加载失败。
- 关闭 `@nuxt/fonts`（`ui: { fonts: false }`）改用系统字体栈，离线/内网可跑。
- 需要登录态的数据都在客户端加载（`onMounted` / `useAsyncData(..., { server: false })`），SSR 只渲染外壳，避免 SSR 阶段没有 cookie 时的 401。
- 未登录直接 302 到登录页（鉴权中间件在服务端也执行）。
- `npm run typecheck`（`nuxt typecheck`，vue-tsc），当前零错误。
- Nuxt 为 **4.6.0**，`vue-router` 为 `^5.3.1`（此前固定 `^4.5.0`，而 Nuxt 已要求 5.x，`node_modules` 里因此存在两份副本）；`nuxt.config.ts` 增加 `sourcemap: { server: false }`，生产构建不再输出服务端 `.map` 文件。`/api/**` 代理 `routeRules` 与 `icon` / `colorMode` / `i18n` 配置均未改动。

### 布局模式

页面通过 `definePageMeta` 声明滚动模式，外壳用纯 CSS 类切换（不依赖渲染期 `matchMedia`，避免水合不一致与首帧闪动）：

- `layoutMode`：桌面端 `scroll`（整页滚动）/ `fixed`（面板内滚动，列表页用）
- `layoutModeMobile`：移动端同上；位置/物品列表在移动端整页滚动，桌面端面板内滚动
- `.desktop-only`：移动端直接不渲染只给桌面用的结构

### 视觉规范（现代清爽）

- 设计令牌集中在 `web/app/assets/css/main.css`：`--hb-brand` / `--hb-surface` / `--hb-text` / `--hb-shadow-*` / `--hb-r-*`，浅色与 `.dark` 各一套；**页面里不要再写死颜色**。
- 通用类：`.hb-card`、`.hb-card-hover`、`.hb-tile`、`.hb-icon-tile`、`.hb-list`/`.hb-list-row`（统一行列表）、`.hb-tag`（标签胶囊）、`.hb-chip`、`.hb-section-title`、`.hb-skeleton`、`.hb-pager`、`.hb-rise`。
- 可复用组件：`SearchBox`（主页与物品页共用搜索框）、`SwipeRow`（移动端左滑编辑/删除）、`ListPager`、`ListSkeleton`。
- 深浅色由 `@nuxtjs/color-mode` 注入 `.dark`（跟随系统，可手动切换并记住）；品牌色在 `app.config.ts`（Nuxt UI primary=teal）。

### 排版（字体）

**字体族**：拉丁字母与数字自托管 **Inter Variable**（`@fontsource-variable/inter/wght.css`，本地 woff2，无外部请求）；中文走各平台原生字体（PingFang SC / HarmonyOS Sans / MiSans / 微软雅黑 / Noto Sans CJK / 思源黑体）——CJK 字体动辄数 MB，原生字形更清晰也更省流量。等宽场景用 `--hb-font-mono`。

**字号阶梯**（全部走令牌，页面里不要再写 px）：`--hb-fs-display`（clamp 自适应页标题）/`h1`/`h2`/`h3`/`body`/`sm`/`xs`；行高 `--hb-lh-*`、字重 `--hb-fw-*`、字距 `--hb-ls-*` 一一对应。

**中文专门处理**：`:lang(zh)` 行高 1.75、字距 0.01em；`html lang` 跟随语言切换；`text-spacing-trim`/`text-autospace` 优化中西文混排；`font-synthesis: none` 禁伪粗斜体；长串用 `.hb-break`、多行截断用 `.hb-clamp-2/3`。

**数字**：金额、数量、计数统一加 `.hb-num`（`tabular-nums`），对齐不跳动。

**工具类**：`.hb-display .hb-h1 .hb-h2 .hb-h3 .hb-body .hb-sm .hb-xs .hb-eyebrow .hb-label .hb-num .hb-mono .hb-link .hb-truncate .hb-clamp-* .hb-break`。

## 功能与页面

| 页面 | 说明 |
| --- | --- |
| `/` 主页 | 物品总数 / 价值总和 / 位置总数 / 标签总数，最近新增、位置列表、书签式标签、搜索框（与物品页共用 `SearchBox`） |
| `/locations` | 桌面：左侧树 + 右侧内容（**拖拽排序与跨层移动由服务端裁决**，防闭环 + sortIndex 量化重排）；移动：树独占整屏，点节点进钻取路由 |
| `/locations/[id]` | 移动端位置详情（竖屏排版）：子位置、本层物品、序列号列表，各自分页 |
| `/items` | 库存概览与快速创建。桌面为表格（表头吸顶、面板内滚动），移动为行卡片（图标砖 + 标题/位置型号/标签 + 金额），支持**左滑编辑/删除**；统一搜索覆盖名称/型号/SN/条码/位置/标签；可导出 CSV |
| `/items/[id]` | 物品详情：照片、标签、位置、**每个 SN 可位于不同位置**、商品条码、追溯码、二维码、来源模板 |
| `/items/new` | 新增物品，支持顶部「套用模板」（也可扫模板条码自动套用）；商品条码置顶可扫码填入，没有条码时可生成系统追溯码 |
| `/templates` | 模板管理（含商品条码），支持搜索与「用模板新增物品」 |
| `/settings` | 家庭管理（成员 / 邀请链接 / 角色）、系统设置（家庭名、货币、语言、时区）、通知器 |
| `/search` | 统一搜索：物品 + 位置 + 标签 + 序列号 |
| `/scan`、`/r/[code]` | 摄像头扫码（需 https/localhost）、图片识别、手动输入/扫码枪；移动端底部扫码按钮弹出「创建 / 查找 / 编辑」气泡 |

- **家庭即数据边界**：注册自动创建个人家庭；接受邀请后拥有多个家庭，通过 `X-Family-Id` 切换；所有查询强制按 `familyId` 过滤。仅家庭所有者可管理成员与邀请。
- **物品页的标签筛选**：不再提供标签选择器；从主页/搜索页的标签书签进来时（`?tagId=`）会显示一个可一键清除的筛选 chip。
- **移动端**：底部 Tab（扫码居中为核心入口）、抽屉菜单、安全区适配、触控目标 ≥44px、表单原生键盘类型。

## 商品条码、追溯码与扫码优先级

- 物品可填「商品条码」（EAN/UPC 等），在**同一家庭内唯一**；重复会被拒绝（`item.barcodeTaken`）。
- 创建物品时**条码优先**：条码字段在表单最前，可点「扫码填入」跳到扫码页，扫到的码带回表单（`/items/new?barcode=...`）。
- **系统追溯码**：物品没有厂家条码时，新增表单会给出「生成追溯码」按钮。追溯码由服务端生成（`POST /items/trace-code`），形如 `HB-XXXX-XXXX`（字符集去掉了易混淆的 `I/L/O/U`），**家庭内唯一**且**创建后不可变更**——更新接口 `UpdateItemDto` 故意不接受该字段，想换只能删除物品后重建。
- 扫码解析优先级：**商品条码 → 追溯码 → 模板 / 物品 / 位置二维码 → SN 序列号**；响应带 `matchedBy`（`barcode` / `traceCode` / `qrcode` / `sn`）便于前端提示。
- 扫到未收录的码时给出「用这个条码新建物品」入口，扫码页可切换「扫到即新建」模式。
- 库存列表的统一搜索（`q`）、物品列表与 CSV 导出都包含商品条码与追溯码列。

## 条码数据收集

由开发者提供的**独立服务**收集「条码 → 商品信息」，综合判定后同步给各实例，创建物品时可自动补全名称/厂商/型号。开关与地址都在 `.env`，**默认开启**；`DATA_COLLECTION_ENDPOINT` 是占位地址，请替换成你自己的服务。

本实例对外的接口（前端用）：

```
GET /api/barcodes/:code/lookup
→ { barcode, local: {id,name,quantity,location}|null, remote: <收集服务返回>|null,
    collectionEnabled: boolean, collectionAvailable: boolean }
```

收集服务需要实现的契约（另一个项目）：

```
GET  {DATA_COLLECTION_ENDPOINT}/barcodes/{code}
  200 → { "barcode": "6901234567890", "name": "5 号电池", "manufacturer": "南孚",
          "model": "碱性", "category": "电池", "imageUrl": null,
          "confidence": 0.86, "sources": 12 }
  404 → 未收录

POST {DATA_COLLECTION_ENDPOINT}/observations
  body → { "barcode": "...", "name": "...", "manufacturer": "...", "model": "...",
           "category": "...", "clientVersion": "homebucket/1" }
  2xx  → 已接收
```

降级策略：未配置地址、超时、网络不可达、非 2xx **都只记日志**，条码填写与物品创建不受影响；前端只在远端有数据时才提示「已用条码库的信息补全」。

## 静态资源自托管

不请求任何外部 CDN：

- 字体：拉丁/数字用本地 `@fontsource-variable/inter` 的 woff2（按 `unicode-range` 分发，浏览器只加载 latin 子集约 48KB）；中文用系统原生字体；已关闭 `@nuxt/fonts`
- 图标：本地 `@iconify-json/lucide` 集合 + 自建 `/_nuxt_icon` 接口，并设 `fallbackToApi: false`，不会回退到 Iconify 公共 API
- 图片/Logo：`web/public/` 本地文件；用户上传的照片存在 `UPLOAD_DIR`（本地磁盘或自建 S3）

## 多语言

翻译文件只有一份，放在 `web/i18n/locales/`（主 `zh-CN`、次 `en`）。后端不做翻译，只返回机器可读的 `code`（如 `location.notFound`），前端按 code 查表，查不到才回退后端的中文兜底 `message`。

新增语言：复制 `web/i18n/locales/en.json` → 改名 → 翻译 → 在 `nuxt.config.ts` 的 `locales` 里注册。详见 `web/i18n/README.md`。

## 演示数据（Mock）

```bash
cd server && npm run build && npm run seed   # seed 跑的是 dist/，需先构建
```

会清空并重建演示账号自己的数据（不影响其它用户），生成一个适合看效果的样板：

- 登录用**用户名 + 密码**（邮箱只是记录字段）：主账号来自 `.env` 的 `DEFAULT_ADMIN_*`（默认 `admin` / `admin`），是「样板间」的 owner
- 共享成员：`family@homebucket.local` / `homebucket123`（普通成员，用来验证多家庭与权限）
- 内容：41 个位置（三层树）、17 个标签、147 件物品（总价值约 ¥5.99 万）、20 个序列号（12 件物品，含同一物品的 SN 分散在不同位置）、14 个模板、4 个未启用的通知器、3 条邀请链接
- 图片：脚本**本地生成** 43 张 SVG 占位图（37 件物品封面 + 6 个位置照片）写入 `UPLOAD_DIR`，不请求任何外部图片
- 物品创建时间分散在约 180 天内，主页「最近新增」看起来更自然
- 可重复执行；脚本在 `server/scripts/seed.mjs`

## 已验证

- **Nuxt 4.6**：Nuxt 4.6.0 + @nuxt/ui 4.11.3 + @nuxtjs/i18n 10.6.0 + Tailwind 4.3.3 + vue-router 5.3.1 + vue-tsc；应用代码在 `web/app/`；`nuxt typecheck` 零错误、`nuxt build` 通过、`/api` 代理正常。
- **接口端到端**：家庭隔离与角色（跨家庭 403、非 owner 403）、邀请链接注册即入家庭、位置树拖拽 move + 闭环校验、同一物品多 SN 分布不同位置、SN / 条码重复校验、仪表盘统计、统一搜索、CSV（UTF-8 BOM、含 SN@位置）、扫码优先级、模板建物品、通知器 9 种、校验错误结构。测试数据已清理。
- **后端**：`nest build` 通过；注册 / 登录 / me 正常，重复注册 409、错误密码与伪造 token 401、参数校验 400；`MAX_UPLOAD_SIZE=1kb` 时 2KB 请求体返回 413；三种日志格式与 `LOG_ACCESS=false` 均生效。
- **启动即迁移**：空 sqlite 库启动 → 自动建库建表并直接注册成功；二次启动输出 `[migrate] provider=sqlite 没有待执行的迁移`；`AUTO_MIGRATE=false` 时跳过。
- **Prisma 老库升级**：`db:baseline` 在不改动任何表的前提下登记 `Init` 并保留增量迁移待执行，随后 `db:run` 应用 `NormalizeFromPrisma` + `RenamePrismaFkIndexes`；该路径先做了演练、再实际执行，无数据丢失，完成后库结构与全新安装一致。
- **Docker**：镜像用 BuildKit 构建成功，单容器同时起前后端，`0.0.0.0:3000` 可访问、`/api` 代理通、后端连上 dev MySQL（`db:true`）；`docker build --check` 无告警。
- **CI**：两个 job 已在真实 GitLab runner 上跑起来（check → image，容器内执行、无 artifacts）。首次运行在 `check` 阶段就失败：server 的 `npm ci` 触发了 `better-sqlite3` 的隐式 `node-gyp rebuild`，而 slim 基础镜像没有 Python（`gyp ERR! find Python … Could not find any Python installation to use`）—— 已按 Dockerfile 里同样的做法加 `--ignore-scripts`，并按 CI 的步骤在干净目录逐条复跑通过（`typecheck`、`db:check-drift` 零漂移、`npm test` 51/51、web 侧 `npm ci` + `nuxt typecheck`）。

