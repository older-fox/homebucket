# syntax=docker/dockerfile:1
# ↑ 固定 BuildKit 的 Dockerfile 前端版本：下面 RUN 里的 --mount=type=cache 只有 BuildKit 前端认识。
#   kaniko 不解析这一行（当注释跳过），本地 docker build 则据此走新版前端，两边语法一致。

# Homebucket 单容器镜像：一个容器内同时运行 Nest 后端与 Nuxt 前端。
#
# 写法参照 DockerFileTest：多阶段构建、按需 COPY（不用 `COPY . .`）、
# 依赖安装里的缓存/临时文件在同一层清掉。
#
# 加速域名：CI 里通过 --build-arg 传入（见 .gitlab-ci.yml）：
#   NODE_IMAGE   基础镜像（Docker Hub 官方仓库 → 加速域名镜像）
#   NPM_REGISTRY npm 源（默认留空 = registry.npmjs.org）
#
# 与 Prisma 时代的两点结构性差异（决定了这版为什么能瘦身）：
#   1. 启动迁移改由 TypeORM 在进程内执行（不再 shell out 到 Prisma CLI），
#      运行期因此**只要 production 依赖**，不必再把整个 server/node_modules 拖进最终镜像。
#   2. Prisma 的 build-schemas / prisma generate 整个构建步骤消失，
#      openssl 与 apt 源注入（当年只为 Prisma 查询引擎而存在）也一并删掉。

# 基础镜像：Node 24 LTS（与开发机一致；NestJS 12 的 schematics 要求 ^22.22.3 || ^24.15.0）。
# 可换成加速域名，例如 --build-arg NODE_IMAGE=docker.1ms.run/library/node:24-bookworm-slim
ARG NODE_IMAGE=node:24-bookworm-slim

# ---------- 基础层：只有 npm 配置 ----------
# 这里刻意不再 apt-get install openssl：那一层当年只为 Prisma 查询引擎的链接依赖而加。
# 迁移到 TypeORM 后，运行期没有任何组件链接系统 libssl（Node 官方镜像自带 OpenSSL，
# mysql2 / nodemailer 走 Node 的 crypto、tls，better-sqlite3 是自带预编译产物的扩展），
# 删掉它既少一层、少一次 apt 索引下载，也少了一个需要维护的 Debian 源注入点。
FROM ${NODE_IMAGE} AS base
# 显式给默认值：配合下面的 set -u，未传参时也不会因"变量未定义"报错
ARG NPM_REGISTRY=""
# update-notifier=false：CI 里不需要 npm 的"有新版本可用"提示，省一次后台网络请求。
# 写成 /root/.npmrc 而不是 ENV，是为了不给运行期镜像多一项环境变量。
RUN set -eu; \
    npm config set update-notifier false; \
    if [ -n "${NPM_REGISTRY:-}" ]; then npm config set registry "$NPM_REGISTRY"; fi
WORKDIR /app

# ---------- 后端构建：装（含 dev 的）依赖 → nest build ----------
FROM base AS server-build
# 只拷后端清单；前后端各自独立 package.json（非 monorepo）。
# 清单放在源码之前 COPY：只要 package.json / package-lock.json 没变，npm ci 这层就一直命中缓存。
COPY server/package.json server/package-lock.json ./server/
# --mount=type=cache：npm 缓存挂到构建缓存上，lock 变动重装时不用重新下载（web 同理）。
# --ignore-scripts：better-sqlite3 的 npm 包带各平台预编译产物（prebuilds/*.node），但它同时带
#   binding.gyp，npm 会因此隐式执行 `node-gyp rebuild`，在 slim 基础镜像里没有 python3/make/g++
#   会直接让 npm ci 失败。跳过安装脚本即可：运行期 lib/binding.js 优先直接 require prebuilds/
#   里的 .node（已实测 --ignore-scripts 装完可正常打开数据库）。
#   生产依赖树里带安装脚本/binding.gyp 的只有 better-sqlite3 这一个包，跳过脚本不影响其它依赖。
RUN --mount=type=cache,target=/root/.npm \
    cd server && npm ci --ignore-scripts --no-audit --no-fund

# 源码在依赖之后 COPY：改业务代码不会让上面那层依赖缓存失效。
COPY server/nest-cli.json server/tsconfig.json server/tsconfig.build.json ./server/
COPY server/src ./server/src

# 原来的 build-schemas.mjs + prisma generate 已随 TypeORM 迁移删除；
# tsconfig.build.json 也不再输出 .d.ts / sourcemap，dist/ 更小、编译更快。
RUN cd server && npm run build

# ---------- 后端运行依赖：只装 production ----------
FROM base AS server-prod-deps
COPY server/package.json server/package-lock.json ./server/
# 这是本次瘦身的关键：旧镜像把 996MB 的整包 node_modules（含 Prisma CLI）搬进运行期，
# 只因为启动迁移要 shell out 到 prisma CLI。现在迁移在进程内跑，运行期只要 production 依赖。
# --ignore-scripts 的理由同 server-build（better-sqlite3 的隐含 node-gyp 构建在 slim 里没有工具链）。
RUN --mount=type=cache,target=/root/.npm \
    cd server && npm ci --omit=dev --ignore-scripts --no-audit --no-fund

# ---------- 前端：装依赖 → nuxt build（产物 .output 自带运行时依赖） ----------
FROM base AS web-build
# 关掉 Nuxt telemetry：构建阶段不要往外发匿名统计，CI 里也少一次网络请求。
# 这里刻意不设 NODE_ENV=production：npm 在 NODE_ENV=production 下默认 omit=dev，
# 而 nuxt build 需要 devDependencies（typescript 等），依赖装不全反而更慢更危险；
# nuxt build 自己就按生产模式构建，SSR 产物照旧，不受这个变量影响。
ENV NUXT_TELEMETRY_DISABLED=1
COPY web/package.json web/package-lock.json ./web/
RUN --mount=type=cache,target=/root/.npm \
    cd web && npm ci --no-audit --no-fund

# Nuxt 4：应用代码在 web/app/，配置与 i18n / public 留在 web/ 根下
COPY web/nuxt.config.ts web/tsconfig.json ./web/
COPY web/app ./web/app
COPY web/i18n ./web/i18n
COPY web/public ./web/public
RUN cd web && npm run build

# ---------- 运行：单容器同时跑前后端 ----------
FROM base AS runtime
ENV NODE_ENV=production \
    WEB_HOST=0.0.0.0 \
    WEB_PORT=3000 \
    DATA_DIR=/data \
    UPLOAD_DIR=/data/uploads

# 容器内数据目录统一放 /data：sqlite 库文件 + 上传图片，挂卷即可持久化
VOLUME ["/data"]
RUN mkdir -p /data/uploads

# 后端运行期需要：
#   · dist 编译产物（含 src/database/migrations 编出来的迁移文件）
#   · node_modules 来自 server-prod-deps：只含 production 依赖，不再带 Prisma CLI / nest CLI / tsc
#   · scripts/ —— 运维脚本（db-baseline.mjs / seed.mjs）：它们跑 dist/ 加生产依赖即可，
#     所以 --omit=dev 不会让它们失效
#   · package.json —— 只为了容器里能直接 `npm run db:baseline` / `npm run seed`
#     （脚本本身 `node scripts/*.mjs` 也能跑，1.8KB 换运维命令可用，值得）
COPY --from=server-prod-deps /app/server/node_modules ./server/node_modules
COPY --from=server-build /app/server/dist ./server/dist
COPY server/package.json ./server/package.json
COPY server/scripts ./server/scripts

# 前端 .output 是自包含产物，运行期不需要 web/node_modules
COPY --from=web-build /app/web/.output ./web/.output

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# 3000 前端对外；3001 后端（容器内由 Nuxt 代理转发，可不对外暴露）
EXPOSE 3000 3001

ENTRYPOINT ["/app/docker-entrypoint.sh"]
