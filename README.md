# Homebucket

类 HomeBox 的收纳归档工具：记录每样东西放在哪里。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 后端 | NestJS 11 + Prisma 6 |
| 前端 | Nuxt 3（Vue 3），SSR |
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
│   │   ├── mysql/schema.prisma   # DB_PROVIDER=mysql
│   │   └── sqlite/schema.prisma  # DB_PROVIDER=sqlite（MySQL light）
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       ├── config/env.ts         # 所有配置项（惰性读取 process.env）
│       ├── logger/               # 应用日志 + nginx 风格访问日志
│       ├── auth/                 # 注册 / 登录 / me（JWT）
│       └── prisma/
└── web/                     # Nuxt 3
    ├── nuxt.config.ts            # 监听地址、/api 代理、LOGO
    ├── public/logo.svg
    ├── composables/useAuth.ts
    └── pages/{index,login,register}.vue
```

## 配置

首次克隆后 `cp .env.example .env`。全部配置都在根目录 `.env`：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DB_PROVIDER` | `mysql` | `mysql` 或 `sqlite`（MySQL light，无需数据库服务） |
| `DATABASE_URL` | dev 库 | `mysql://user:pass@host:3306/db` |
| `DB_FILE_PATH` | `file:./data/homebucket.db` | sqlite 数据库文件路径 |
| `AUTO_MIGRATE` | `true` | 进程启动时自动执行 `prisma migrate deploy`（空库首次启动自动建表） |
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

## 启动即迁移

后端启动时（`AUTO_MIGRATE=true`，默认开）会先执行 `prisma migrate deploy`，按 `DB_PROVIDER` 选择 `prisma/<provider>/schema.prisma`：

- 空库首次启动自动建表，不会再出现"表不存在导致启动失败"；
- 幂等，已应用过的迁移不会重复执行；
- 迁移失败只打 `[migrate]` 错误日志、不阻断进程，`/health` 会显示 `degraded`；数据库连接失败同样不再中断启动。

想自己控制迁移节奏：`AUTO_MIGRATE=false`，然后手动 `cd server && npm run prisma:deploy`。

## 已验证

- 后端：`nest build` 通过；注册 / 登录 / me 正常，重复注册 409、错误密码与伪造 token 401、参数校验 400；`MAX_UPLOAD_SIZE=1kb` 时 2KB 请求体返回 413；三种日志格式与 `LOG_ACCESS=false` 均生效。
- 前端：构建通过；`0.0.0.0:3000` 监听；`/api` 代理转发正常；登录 / 注册页渲染正常。
- Docker：镜像构建成功，单容器同时起前后端，`0.0.0.0:3000` 可访问、`/api` 代理通、后端连上 dev MySQL（`db:true`）。
- 启动即迁移：删掉 sqlite 库文件后启动，自动建库建表并直接注册成功；二次启动输出 `No pending migrations to apply`；`AUTO_MIGRATE=false` 时跳过迁移。
- MySQL 上也跑通了一次自动迁移（`User` 表已由启动流程创建），测试数据已清理。

