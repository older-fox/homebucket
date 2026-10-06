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
- **两种数据库共用一个模型**：MySQL 与 SQLite（“MySQL light”）由同一份 `models.prisma` 生成两套 schema。

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
- **两种数据库**：MySQL（默认）与 SQLite（“MySQL light”），同一份模型生成两套 schema。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 后端 | NestJS 11 + Prisma 6.19（Express 5） |
| 前端 | Nuxt 4（Vue 3.5）+ Nuxt UI v4 + Tailwind v4，SSR |
| 数据库 | MySQL（默认）/ SQLite（“MySQL light”，文件型） |
| 部署 | 单 Docker 容器（多阶段构建）；GitLab CI 用 kaniko 在容器内构建并推送镜像 |

**非 monorepo**：`server/` 与 `web/` 是两个完全独立的 npm 包，各有自己的 `package.json` 和 `node_modules`。仓库根目录只放环境变量、Dockerfile、CI 与文档。

## 目录结构

```
.
├── .env / .env.example      # 环境变量（.env 已 gitignore，前后端共用）
├── Dockerfile               # 多阶段构建，运行期单容器同时跑前后端
├── docker-entrypoint.sh
├── .dockerignore
├── .gitlab-ci.yml           # kaniko 镜像流水线（容器内构建 → 推项目容器注册表）
├── server/                  # NestJS + Prisma
│   ├── prisma/
│   │   ├── src/models.prisma        # 模型唯一来源（双 provider 共用）
│   │   ├── mysql/{schema.prisma,migrations/}   # 生成物；migrations 只有一个 init
│   │   └── sqlite/{schema.prisma,migrations/}  # 生成物；migrations 只有一个 init
│   ├── scripts/
│   │   ├── build-schemas.mjs        # 由唯一来源生成两份 schema
│   │   ├── prisma.mjs               # Prisma CLI 包装（选 provider + 先重建 schema）
│   │   └── seed.mjs                 # 演示数据
│   └── src/
│       ├── main.ts  app.module.ts
│       ├── config/env.ts            # 所有配置项（惰性读取 process.env）
│       ├── config/bootstrap-admin.ts# 空库首次启动创建管理员
│       ├── common/                  # 家庭上下文守卫、参数装饰器、校验归一化
│       ├── logger/                  # 应用日志 + nginx 风格访问日志
│       ├── prisma/                  # PrismaService + auto-migrate
│       ├── auth/                    # 注册 / 登录 / me（用户名 + 密码，JWT）
│       ├── families/                # 家庭、成员、邀请链接
│       ├── locations/               # 位置树（拖拽由服务端裁决）
│       ├── items/                   # 物品 + SN 单元 + CSV 导出
│       ├── tags/                    # 标签
│       ├── templates/               # 模板与「用模板建物品」
│       ├── uploads/                 # 上传（local / S3 抽象）
│       ├── collection/              # 条码数据收集客户端
│       ├── notifiers/               # 通知器（SMTP / Telegram / 钉钉 …）
│       ├── dashboard/  search/  scan/
│       └── ...
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
npm run prisma:generate   # 按 DB_PROVIDER 生成 Prisma Client
npm run prisma:deploy     # 应用迁移建表（空库会跑单一 init 迁移）
npm run start:dev         # http://localhost:3001/api

# 3) 前端（另开一个终端）
cd web
npm install
npm run dev               # http://<本机IP>:3000
```

接口：`GET /api`（信息）、`GET /api/health`（健康检查）、`POST /api/auth/register`（用户名 + 密码，邮箱选填）、`POST /api/auth/login`（**用户名** + 密码）、`GET /api/auth/me`（需 `Authorization: Bearer <token>`）。

想直接看效果：`cd server && npm run seed`（见下方「演示数据」）。

## 配置

全部配置集中在根目录 `.env`，前端构建/运行与后端进程共用。

### 通用 / 数据库

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `development` | 运行环境 |
| `DB_PROVIDER` | `mysql` | `mysql` 或 `sqlite`（“MySQL light”，无需数据库服务） |
| `DATABASE_URL` | — | `mysql://user:pass@host:3306/db`；**不要加引号**（见下方注意） |
| `SHADOW_DATABASE_URL` | 注释掉 | 仅开发用：`prisma migrate dev` 在 MySQL 上的影子库 |
| `AUTO_MIGRATE` | `true` | 进程启动时自动 `prisma migrate deploy`（空库首次启动自动建表） |
| `DB_FILE_PATH` | `file:./data/homebucket.db` | sqlite 库文件路径（Docker 内用 `file:/data/homebucket.db`） |

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

### 单一模型来源，两份 schema

Prisma 的 `provider` 不能写成环境变量，所以模型只在 `server/prisma/src/models.prisma` 维护，`scripts/build-schemas.mjs` 给它拼上不同 provider 的头，生成：

- `server/prisma/mysql/schema.prisma`（`DATABASE_URL`）
- `server/prisma/sqlite/schema.prisma`（`DB_FILE_PATH`）

`npm run prisma:generate` / `prisma:migrate` / `prisma:deploy` 都会先重建这两份 schema，无需手动同步。

### 迁移已压缩为单个 init

两边的 `migrations/` 目录各只有**一个** `20261006000000_init`（含 `migration_lock.toml`），它是当前 schema 的完整快照。因为生产库此前为空，没有历史需要保留。

- **全新库 / 生产库**：直接 `npm run prisma:deploy`（或启动后端）即可，一次建好全部表。
- **跑过旧迁移的开发库**：表还在但 `_prisma_migrations` 里记着旧的 6 条记录，`deploy` 会因“表已存在”报错。二选一对齐：
  1. 重建（会清空数据，之后 `npm run seed` 重新灌）：
     `npx prisma migrate reset --schema prisma/mysql/schema.prisma --skip-seed`
  2. 只对齐记录、不丢数据：在库中 `DELETE FROM _prisma_migrations;`，再
     `npx prisma migrate resolve --applied 20261006000000_init --schema prisma/mysql/schema.prisma`

### 启动即迁移

后端启动时（`AUTO_MIGRATE=true`，默认开）先执行 `prisma migrate deploy`：

- 空库首次启动自动建表，不会再出现“表不存在导致启动失败”；
- 幂等，已应用的迁移不会重复执行；
- 失败只打 `[migrate]` 错误日志、不阻断进程，`/health` 会显示 `degraded`；数据库连不上也不中断启动。

想自己控制节奏：`AUTO_MIGRATE=false`，手动 `cd server && npm run prisma:deploy`。

**空库首次启动**还会按 `DEFAULT_ADMIN_*` 自动创建管理员（`AUTO_CREATE_ADMIN=false` 可关），日志会打印账号，登录后请尽快改密码。

### SQLite（MySQL light）

```bash
# .env
DB_PROVIDER=sqlite
DB_FILE_PATH="file:./data/homebucket.db"   # 实际不加引号
```

然后 `npm run prisma:generate && npm run prisma:deploy`，库文件落在 `server/prisma/sqlite/data/`（已 gitignore）。

## Docker（单容器）

多阶段构建：`base → server-build → web-build → runtime`，按需 `COPY`（不使用 `COPY . .`），`.dockerignore` 排除 `node_modules` / `dist` / `.output` / `.nuxt`。运行期一个容器同时起 Nest（`:3001`）与 Nuxt（`:3000`），前端通过代理访问后端。

```bash
docker build \
  --build-arg DB_PROVIDER=mysql \
  --build-arg NODE_IMAGE=docker.1ms.run/library/node:22-bookworm-slim \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  --build-arg APT_MIRROR=http://mirrors.tuna.tsinghua.edu.cn \
  -t homebucket .

docker run -d --name homebucket --env-file .env -v hb-data:/data -p 3000:3000 homebucket
```

- 容器内数据统一放 `/data`（sqlite 库文件 + 上传图片），`VOLUME ["/data"]`，挂卷即可持久化；通常只需暴露 3000。
- 数据库迁移由后端进程启动时自动完成。
- 基础镜像装了 `openssl`（Prisma 查询引擎依赖），且在 `prisma generate` 之前装好。装它走的 apt 源默认换成清华（`APT_MIRROR`），只为这一层提速。
- **运行期刻意不裁剪 devDependencies**：启动自动迁移依赖 `prisma` CLI（`server/src/prisma/auto-migrate.ts` 会 `require.resolve('prisma/build/index.js')`），`--omit=dev` 会让迁移被静默跳过。前端 `.output` 自包含，运行期不带 `web/node_modules`。
- `NODE_IMAGE` / `NPM_REGISTRY` / `APT_MIRROR` 都是加速用构建参数，本地默认走官方源即可不传；`APT_MIRROR` 用 `http://`（slim 镜像里没有 `ca-certificates`，`https` 会让 `apt-get update` 证书校验失败）。

## CI（GitLab + kaniko）

`.gitlab-ci.yml` 只有一个 job `docker:image`：

- **整个 job 在容器内执行**：使用 kaniko executor（debug）镜像，不需要 docker daemon / dind，也不需要 privileged runner。
- **不做 typecheck、不做独立 build 校验 job**：编译发生在 `docker build` 内部（`nest build` / `nuxt build`），失败即 job 失败。
- **零 artifacts**：构建结果只以镜像形式推送到**项目的容器注册表**（`$CI_REGISTRY_IMAGE`）。
- **tag 策略**：始终推 `sha-<short>`；推送默认分支额外推 `latest`；打 tag 额外推版本号。
- **触发**：push 默认分支 / 打 tag / 页面 Run pipeline / API。

加速域名（可在 CI/CD Variables 覆盖）：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NODE_IMAGE` | `docker.1ms.run/library/node:22-bookworm-slim` | 基础镜像（Docker Hub 加速） |
| `NPM_REGISTRY` | `https://registry.npmmirror.com` | npm 源 |
| `APT_MIRROR` | `http://mirrors.tuna.tsinghua.edu.cn` | Debian apt 源（装 openssl 提速）；用 `http://` |
| `DB_PROVIDER` | `mysql` | 打进镜像的 Prisma schema |

kaniko 镜像本身在 gcr.io，走 `gcr.m.daocloud.io/kaniko-project/executor:debug` 加速（`docker.m.daocloud.io` 是 Docker Hub 的加速域名，没有这个仓库，会报「不在白名单」）。首次运行会创建 `$CI_REGISTRY_IMAGE/cache` 作为构建缓存；若注册表禁用了子仓库，去掉脚本里的 `--cache=true --cache-repo ...` 两行即可。

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
cd server && npm run seed
```

会清空并重建演示账号自己的数据（不影响其它用户），生成一个适合看效果的样板：

- 登录用**用户名 + 密码**（邮箱只是记录字段）：主账号来自 `.env` 的 `DEFAULT_ADMIN_*`（默认 `admin` / `admin`），是「样板间」的 owner
- 共享成员：`family@homebucket.local` / `homebucket123`（普通成员，用来验证多家庭与权限）
- 内容：41 个位置（三层树）、17 个标签、147 件物品（总价值约 ¥5.99 万）、20 个序列号（12 件物品，含同一物品的 SN 分散在不同位置）、14 个模板、4 个未启用的通知器、3 条邀请链接
- 图片：脚本**本地生成** 43 张 SVG 占位图（37 件物品封面 + 6 个位置照片）写入 `UPLOAD_DIR`，不请求任何外部图片
- 物品创建时间分散在约 180 天内，主页「最近新增」看起来更自然
- 可重复执行；脚本在 `server/scripts/seed.mjs`

## 已验证

- **Nuxt 4**：Nuxt 4.5.2 + @nuxt/ui 4.11 + @nuxtjs/i18n 10.6 + Tailwind 4.3 + vue-tsc；应用代码迁到 `web/app/`；`nuxt typecheck` 零错误、`nuxt build` 通过、全部页面 200、`/api` 代理正常。
- **接口端到端**：家庭隔离与角色（跨家庭 403、非 owner 403）、邀请链接注册即入家庭、位置树拖拽 move + 闭环校验、同一物品多 SN 分布不同位置、SN / 条码重复校验、仪表盘统计、统一搜索、CSV（UTF-8 BOM、含 SN@位置）、扫码优先级、模板建物品、通知器 9 种、校验错误结构。测试数据已清理。
- **后端**：`nest build` 通过；注册 / 登录 / me 正常，重复注册 409、错误密码与伪造 token 401、参数校验 400；`MAX_UPLOAD_SIZE=1kb` 时 2KB 请求体返回 413；三种日志格式与 `LOG_ACCESS=false` 均生效。
- **启动即迁移**：空 sqlite 库启动 → 自动建库建表并直接注册成功；二次启动输出 `No pending migrations to apply`；`AUTO_MIGRATE=false` 时跳过。
- **迁移压缩**：单 `init` 迁移在全新 sqlite 库上 `migrate deploy` 成功、`migrate status` 为 up to date；`migrate diff --from-migrations --to-schema-datamodel` 输出 `No difference detected`。
- **Docker**：镜像构建成功，单容器同时起前后端，`0.0.0.0:3000` 可访问、`/api` 代理通、后端连上 dev MySQL（`db:true`）；`docker build --check` 无告警。
- **CI**：kaniko 流水线为单 job、容器内执行、无 artifacts；加速域名与镜像路径已按环境配置（尚未在真实 GitLab runner 上跑过）。
