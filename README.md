# Homebucket

类 HomeBox 的收纳归档工具：记录每样东西放在哪里。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 后端 | NestJS 11 + Prisma 6.19 |
| 前端 | Nuxt 4（Vue 3.5）+ Nuxt UI v4 + Tailwind v4，SSR |
| 数据库 | MySQL（默认）/ SQLite（"MySQL light"，文件型） |
| 部署 | 单个 Docker 容器同时跑前后端 |

**非 monorepo**：`server/` 与 `web/` 是两个完全独立的 npm 包，各有自己的 `package.json` 和 `node_modules`。仓库根目录只放环境变量、Dockerfile 和文档。

## 目录结构

```
.
├── .env                     # 真实环境变量（已 gitignore，前后端共用）
├── .env.example             # 环境变量模板
├── Dockerfile               # 多阶段构建，运行期单容器跑前后端
├── docker-entrypoint.sh
├── server/                  # NestJS + Prisma
│   ├── prisma/
│   │   ├── src/models.prisma     # 模型唯一来源（双 provider 共用）
│   │   ├── mysql/schema.prisma   # 生成物：DB_PROVIDER=mysql
│   │   └── sqlite/schema.prisma  # 生成物：DB_PROVIDER=sqlite（MySQL light）
│   ├── scripts/build-schemas.mjs # 由唯一来源生成两份 schema
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       ├── config/env.ts         # 所有配置项（惰性读取 process.env）
│       ├── common/               # 家庭上下文守卫、参数装饰器、校验归一化
│       ├── logger/               # 应用日志 + nginx 风格访问日志
│       ├── auth/                 # 注册 / 登录 / me（JWT）
│       ├── families/             # 家庭、成员、邀请链接
│       ├── locations/            # 位置树（拖拽排序由服务端裁决）
│       ├── items/                # 物品 + SN 单元 + CSV 导出
│       ├── tags/                 # 标签
│       ├── templates/            # 模板与「用模板建物品」
│       ├── uploads/              # 上传（local / S3 抽象）
│       ├── notifiers/            # 通知器（SMTP / Telegram / 钉钉 …）
│       ├── dashboard/            # 主页汇总
│       ├── search/               # 统一搜索
│       └── scan/                 # 二维码生成 + 扫码落地
└── web/                     # Nuxt 4 + Nuxt UI v4 (Tailwind v4)
    ├── nuxt.config.ts            # 监听地址、/api 代理、i18n、LOGO
    ├── i18n/locales/{zh-CN,en}.json  # 翻译文件（唯一翻译源，社区可提交）
    ├── public/logo.svg
    └── app/                      # Nuxt 4 的应用目录
        ├── app.vue  app.config.ts
        ├── assets/css/main.css   # Tailwind + 主题变量
        ├── layouts/{default,auth}.vue  # 桌面侧栏 / 移动底部 Tab / 登录页壳
        ├── middleware/auth.global.ts   # 未登录跳转
        ├── composables/          # useApi / useFamily / useAuth / useFormat / useNav
        ├── components/           # PhotoUploader / LocationTree / ItemForm 等
        ├── types/                # 前后端共享的前端类型
        └── pages/                # 主页、位置、物品、模板、设置、搜索、扫码、邀请
```

## 配置

首次克隆后 `cp .env.example .env`。全部配置都在根目录 `.env`：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DB_PROVIDER` | `mysql` | `mysql` 或 `sqlite`（MySQL light，无需数据库服务） |
| `DATABASE_URL` | dev 库 | `mysql://user:pass@host:3306/db` |
| `DB_FILE_PATH` | `file:./data/homebucket.db` | sqlite 数据库文件路径（Docker 里用 `file:/data/homebucket.db`） |
| `AUTO_MIGRATE` | `true` | 进程启动时自动执行 `prisma migrate deploy`（空库首次启动自动建表） |
| `DATA_DIR` | `./data` | 数据根目录（Docker 里为 `/data`，挂卷持久化） |
| `UPLOAD_DIR` | `${DATA_DIR}/uploads` | 上传文件目录，留空则自动推导 |
| `STORAGE_DRIVER` | `local` | `local` 落本地磁盘并由 `/api/media/` 提供；`s3` 走对象存储 |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_FORCE_PATH_STYLE` | — | S3 兼容存储配置（`STORAGE_DRIVER=s3` 时生效） |
| `DEFAULT_CURRENCY` / `DEFAULT_LOCALE` | `CNY` / `zh-CN` | 新家庭的默认主货币与语言 |
| `AUTO_CREATE_ADMIN` | `true` | 空库首次启动时是否自动创建管理员 |
| `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD` / `DEFAULT_ADMIN_EMAIL` | `admin` / `admin` / `admin@example.com` | 首次初始化（空库启动或 npm run seed）使用的管理员账号 |
| `DATA_COLLECTION_ENABLED` | `true` | 条码数据收集总开关；关闭后本实例不向外部发送任何请求 |
| `DATA_COLLECTION_ENDPOINT` | 占位地址 | 条码收集服务地址（**独立项目**，需替换成你自己的） |
| `DATA_COLLECTION_SUBMIT` | `true` | 是否把本实例填写的条码信息回传 |
| `DATA_COLLECTION_TIMEOUT_MS` | `1500` | 收集服务请求超时，超时静默降级 |
| `PUBLIC_BASE_URL` | 空 | 二维码里写入的站点根地址（如 `http://192.168.1.10:3000`）；留空则二维码只含 token |
| `SERVER_PORT` / `API_PREFIX` | `3001` / `api` | 后端监听端口与路由前缀 |
| `CORS_ORIGIN` | `*` | 允许跨域的来源，多个用逗号分隔 |
| `MAX_UPLOAD_SIZE` | `1gb` | 请求体 / 上传上限，支持 `1024` / `10mb` / `1gb` |
| `LOG_LEVEL` | `info` | `error` / `warn` / `info` / `debug` / `verbose` |
| `LOG_FORMAT` | `pretty` | `pretty`（彩色）/ `json`（单行 JSON）/ `nginx`（nginx 风格） |
| `LOG_ACCESS` | `true` | 是否输出 nginx combined 风格访问日志 |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | — / `7d` | 登录凭证签名 |
| `WEB_HOST` | `0.0.0.0` | 前端监听 IP，`0.0.0.0` 表示局域网 / 容器外可访问 |
| `WEB_PORT` | `3000` | 前端监听端口 |
| `NUXT_PUBLIC_API_BASE` | `/api` | 浏览器访问后端地址（默认走代理，同源） |
| `NUXT_API_BASE` | `http://127.0.0.1:3001/api` | SSR 时访问后端地址 |
| `API_PROXY_TARGET` | `http://127.0.0.1:3001` | Nuxt 代理 `/api` 的目标 |

> 改 `.env` 后需重启进程；`LOG_*` 与端口类配置在启动时读取。

## 跨域是怎么解决的

前端 `WEB_HOST=0.0.0.0` 对外后，浏览器可能用 `localhost`、`127.0.0.1`、局域网 IP、域名等各种来源访问，靠白名单穷举来源不可靠。因此：

1. Nuxt 用 nitro `routeRules` 把 `/api/**` 代理到后端（`API_PROXY_TARGET`），浏览器始终**同源**请求 `/api`，天然没有跨域问题；
2. 后端同时开了 `CORS_ORIGIN`（默认 `*`）并放行 `Authorization` 头，方便直连 `:3001` 调试或第三方调用。

## 前端说明（Nuxt 4）

- 应用代码在 `web/app/`（Nuxt 4 目录规范）：`pages` / `components` / `composables` / `layouts` / `middleware` / `assets` / `types`；`nuxt.config.ts`、`public/`、`i18n/` 留在 `web/` 根下。
- 图标使用本地图标集 `@iconify-json/lucide`，不依赖 Iconify 在线服务；**注意** `@nuxt/icon` 的接口已改到 `/_nuxt_icon`，否则会被下面的 `/api/**` 代理转发给 Nest 导致图标全部加载失败。
- 关闭 `@nuxt/fonts`（`ui: { fonts: false }`）改用系统字体栈，离线 / 内网部署不需要外网。
- 需要登录态的数据都在客户端加载（`onMounted` 或 `useAsyncData(..., { server: false })`），SSR 只负责渲染外壳，避免 SSR 阶段没有 cookie 时的 401。
- `npm run typecheck`（= `nuxt typecheck`，vue-tsc），当前零错误。

### 视觉规范（现代清爽）

- 设计令牌集中在 `web/app/assets/css/main.css`：`--hb-brand` / `--hb-surface` / `--hb-text` / `--hb-shadow-*` / `--hb-r-*`，浅色与 `.dark` 各一套；**页面里不要再写死颜色**。
- 通用类：`.hb-card`（卡片）、`.hb-card-hover`（悬浮上移）、`.hb-tile`（统计卡+光斑）、`.hb-icon-tile`（图标砖）、`.hb-section-title`、`.hb-chip`、`.hb-row`、`.hb-skeleton`、`.hb-rise`（进入动效）。
- 壳层：桌面左侧栏（品牌块 + 家庭切换 + 导航高亮竖条），移动端底部 Tab（胶囊高亮）+ 抽屉；顶栏毛玻璃 + 搜索 + 深浅色/语言切换。
- 深浅色由 `@nuxtjs/color-mode` 注入 `.dark` 类（跟随系统，可手动切换并记住）。
- 品牌色在 `app.config.ts`（Nuxt UI primary=teal）。

### 排版（字体）

**字体族**：拉丁字母与数字自托管 **Inter Variable**（`@fontsource-variable/inter/wght.css`，本地 woff2，无外部请求、离线可用）；中文走各平台原生字体（PingFang SC / HarmonyOS Sans / MiSans / 微软雅黑 / Noto Sans CJK / 思源黑体）——CJK 字体动辄数 MB，原生字形更清晰也更省流量。等宽场景用 `--hb-font-mono`。

**字号阶梯**（全部走令牌，页面里不要再写 px）：`--hb-fs-display`（clamp 自适应页标题）/`--hb-fs-h1`/`--hb-fs-h2`/`--hb-fs-h3`/`--hb-fs-body`/`--hb-fs-sm`/`--hb-fs-xs`；行高 `--hb-lh-*`、字重 `--hb-fw-*`、字距 `--hb-ls-*` 一一对应。

**中文专门处理**：
- `:lang(zh)` 提升行高到 1.75、字距放 0.01em（中文笔画密，需要更透气）；拉丁标题才做负字距收紧
- `html lang` 跟随语言切换（`app.vue` 里 `useHead`），所以上面规则会随中英文自动切换
- `text-spacing-trim: trim-start` + `text-autospace`（Chromium 123+ 渐进增强）优化中西文混排与标点
- `font-synthesis: none` 禁止伪粗体/伪斜体（中文伪粗体会糊）
- 长串（URL、序列号）用 `.hb-break` 安全换行，多行截断用 `.hb-clamp-2/3`

**数字**：金额、数量、计数统一加 `.hb-num`（`tabular-nums` + `tnum`），列表与统计卡数值对齐不跳动。

**工具类**：`.hb-display` `.hb-h1` `.hb-h2` `.hb-h3` `.hb-body` `.hb-sm` `.hb-xs` `.hb-eyebrow` `.hb-label` `.hb-num` `.hb-mono` `.hb-link` `.hb-truncate` `.hb-clamp-*` `.hb-break`。

## 启动

后端：

```bash
cd server
npm install
npm run prisma:generate              # 按 DB_PROVIDER 生成 Prisma Client
npm run prisma:migrate               # 开发环境同步表结构（MySQL 需要 SHADOW_DATABASE_URL）
# 生产/不想起影子库：npm run prisma:deploy
npm run start:dev                    # http://localhost:3001/api
```

前端：

```bash
cd web
npm install
npm run dev                          # http://<本机IP>:3000
npm run typecheck                    # nuxt typecheck（vue-tsc，零错误）
```

接口：`GET /api`（信息）、`GET /api/health`（健康检查）、`POST /api/auth/register`、`POST /api/auth/login`、`GET /api/auth/me`（需 `Authorization: Bearer <token>`）。

## SQLite（MySQL light）

```bash
# .env
DB_PROVIDER=sqlite
DB_FILE_PATH="file:./data/homebucket.db"
```

然后 `npm run prisma:generate && npm run prisma:migrate`，数据库文件落在 `server/prisma/sqlite/data/`（已 gitignore）。
两个 schema 的模型必须同步修改——Prisma 的 `provider` 不支持写成环境变量，只能分文件。

## Docker（单容器）

```bash
docker build --build-arg DB_PROVIDER=mysql -t homebucket .
docker run --env-file .env -p 3000:3000 -p 3001:3001 homebucket
```

容器内：Nuxt 监听 `0.0.0.0:3000`，Nest 监听 `:3001`，前端通过代理访问后端，通常只需暴露 3000。数据库迁移由后端进程启动时自动完成。

两个坑已处理：

- 基础镜像装了 `openssl`（Prisma 查询引擎依赖它），且必须在 `prisma generate` **之前**装好，否则生成出来的引擎版本和运行环境对不上；
- `docker run --env-file` **不会**去掉值两侧的引号，所以 `.env` 里的 `DATABASE_URL` 不要加引号。

## 演示数据（Mock）

```bash
cd server && npm run seed
```

会清空并重建演示账号自己的数据（不影响其它用户），生成一个适合看效果的样板：

- 主账号取自 `.env` 的 `DEFAULT_ADMIN_*`（默认 `admin` / `admin` / `admin@example.com`），是「样板间」的 owner
- 共享成员：`family@homebucket.local` / `homebucket123`（「样板间」的普通成员，用来验证多家庭与权限）
- 内容：41 个位置（三层树，含玄关/客厅/厨房/主卧/儿童房/书房/卫生间/储藏室/车库/阁楼等）、17 个标签、147 件物品（总价值约 ¥5.99 万）、20 个序列号（12 件物品，含同一物品的 SN 分散在不同位置）、14 个模板、4 个未启用的通知器（Bark/Telegram/钉钉/SMTP）、3 条邀请链接
- 图片：脚本会**本地生成** 43 张 SVG 占位图（37 件物品封面 + 6 个位置照片）写入 `UPLOAD_DIR`，不请求任何外部图片
- 角色演示：admin 是「样板间」owner，另有两个成员账号（family=admin 角色、kid=member 角色）可用来验证权限与多家庭
- 物品创建时间分散在约 180 天内，主页「最近新增」看起来更自然
- 可重复执行；脚本在 `server/scripts/seed.mjs`

## 启动即迁移

后端启动时（`AUTO_MIGRATE=true`，默认开）会先执行 `prisma migrate deploy`，按 `DB_PROVIDER` 选择 `prisma/<provider>/schema.prisma`：

- 空库首次启动自动建表，不会再出现"表不存在导致启动失败"；
- 幂等，已应用过的迁移不会重复执行；
- 迁移失败只打 `[migrate]` 错误日志、不阻断进程，`/health` 会显示 `degraded`；数据库连接失败同样不再中断启动。

想自己控制迁移节奏：`AUTO_MIGRATE=false`，然后手动 `cd server && npm run prisma:deploy`。

**空库首次启动**还会按 `DEFAULT_ADMIN_*` 自动创建一个管理员（可用 `AUTO_CREATE_ADMIN=false` 关闭），日志里会打印账号，登录后请尽快改密码。

## 功能与页面

| 页面 | 说明 |
| --- | --- |
| `/` 主页 | 物品总数 / 价值总和 / 位置总数 / 标签总数，最近新增物品、位置列表、书签式标签、搜索框 |
| `/locations` | 左侧树 + 右侧内容；**拖拽排序与跨层移动由服务端裁决**（`PATCH /locations/:id/move`，防闭环 + sortIndex 量化重排），移动端为钻取式导航 |
| `/items` | 库存概览与快速创建，按关键词 / SN / 位置 / 标签搜索，导出 CSV（不含缩略图） |
| `/items/[id]` | 物品详情：照片、标签、位置、**每个 SN 可位于不同位置**、二维码 |
| `/templates` | 模板管理，支持「用模板新增物品」 |
| `/settings` | 家庭管理（成员 / 邀请链接 / 角色）、系统设置（家庭名、货币、语言、时区）、通知器 |
| `/search` | 统一搜索：物品 + 位置 + 标签 + 序列号 |
| `/scan`、`/r/[code]` | 摄像头扫码（需 https/localhost）、图片识别、手动输入/扫码枪，识别后跳转详情 |

- **家庭即数据边界**：注册自动创建个人家庭；接受邀请后拥有多个家庭，通过 `X-Family-Id` 切换；所有查询强制按 `familyId` 过滤。仅家庭所有者可管理成员与邀请。
- **通知器**：SMTP、Google Chat、Telegram、Discord、钉钉、飞书、企业微信、Bark、Server 酱，支持按事件订阅与测试发送。
- **移动端**：底部 Tab、抽屉菜单、安全区适配、触控目标 ≥44px、表单原生键盘类型，不是简单重排版。

## 商品条码与扫码优先级

- 物品可填「商品条码」（EAN/UPC 等），在**同一家庭内唯一**；重复会被拒绝（`item.barcodeTaken`）。
- 创建物品时**条码优先**：条码字段放在表单最前，可点「扫码填入」跳到扫码页，扫到的码会带回表单（`/items/new?barcode=...`）。
- 扫码解析优先级：**商品条码 → 物品/位置二维码 → SN 序列号**；响应里带 `matchedBy` 便于前端提示。
- 扫到未收录的码时，扫码页会给出「用这个条码新建物品」的入口，扫码页可切换「扫到即新建」模式。
- 库存列表的统一搜索（`q`）与 CSV 导出都包含条码列。

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
- 图标：本地 `@iconify-json/lucide` 集合 + 自建 `/_nuxt_icon` 接口，并设置 `fallbackToApi: false`，不会回退到 Iconify 公共 API
- 图片/Logo：`web/public/` 本地文件；用户上传的照片存在 `UPLOAD_DIR`（本地磁盘或自建 S3）
- 校验方式：`nuxt build` 后审计产物中的外部域名（只剩注释/文档链接常量）

## 多语言

翻译文件只有一份，放在 `web/i18n/locales/`（主 `zh-CN`、次 `en`）。后端不做翻译，只返回机器可读的 `code`（如 `location.notFound`），前端按 code 查表，查不到才回退后端的中文兜底 `message`。

新增语言：复制 `web/i18n/locales/en.json` → 改名 → 翻译 → 在 `nuxt.config.ts` 的 `locales` 里注册。详见 `web/i18n/README.md`。

## 已验证

- **Nuxt 4 升级**：Nuxt 4.5.2 + @nuxt/ui 4.11 + @nuxtjs/i18n 10.6 + Tailwind 4.3 + vue-tsc，应用代码迁到 `web/app/`；`nuxt typecheck` 零错误、`nuxt build` 通过、全部页面 SSR 200、`/api` 代理正常（原先误装 @nuxt/ui v4 与 Nuxt 3 不兼容，已统一到 Nuxt 4）。
- **新功能接口端到端 45/45 通过**（`/tmp/hb-smoke.mjs`）：家庭隔离与角色（跨家庭 403、非 owner 403）、邀请链接注册即入家庭、位置树拖拽 move + 闭环校验、同一物品多 SN 分布不同位置、SN 重复校验、仪表盘统计与价值合计、统一搜索、CSV（UTF-8 BOM、含 SN@位置、无缩略图字段）、扫码（物品二维码 / SN / 404）、模板建物品、通知器 9 种与类型校验、校验错误结构。测试数据已清理。

- 后端：`nest build` 通过；注册 / 登录 / me 正常，重复注册 409、错误密码与伪造 token 401、参数校验 400；`MAX_UPLOAD_SIZE=1kb` 时 2KB 请求体返回 413；三种日志格式与 `LOG_ACCESS=false` 均生效。
- 前端：构建通过；`0.0.0.0:3000` 监听；`/api` 代理转发正常；登录 / 注册页渲染正常。
- Docker：镜像构建成功，单容器同时起前后端，`0.0.0.0:3000` 可访问、`/api` 代理通、后端连上 dev MySQL（`db:true`）。
- 启动即迁移：删掉 sqlite 库文件后启动，自动建库建表并直接注册成功；二次启动输出 `No pending migrations to apply`；`AUTO_MIGRATE=false` 时跳过迁移。
- MySQL 上也跑通了一次自动迁移（`User` 表已由启动流程创建），测试数据已清理。

