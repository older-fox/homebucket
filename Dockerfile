# Homebucket 单容器镜像：一个容器内同时运行 Nest 后端与 Nuxt 前端。
#
# 写法参照 DockerFileTest：多阶段构建、按需 COPY（不用 `COPY . .`）、
# 依赖安装里的缓存/临时文件在同一层清掉。
#
# 加速域名：CI 里通过 --build-arg 传入（见 .gitlab-ci.yml）：
#   NODE_IMAGE   基础镜像（Docker Hub 官方仓库 → 加速域名镜像）
#   NPM_REGISTRY npm 源（默认留空 = registry.npmjs.org）

# 基础镜像：可换成加速域名，例如 --build-arg NODE_IMAGE=docker.1ms.run/library/node:22-bookworm-slim
ARG NODE_IMAGE=node:22-bookworm-slim

# ---------- 基础层：openssl（Prisma 引擎需要）+ npm 加速源 ----------
FROM ${NODE_IMAGE} AS base
ARG NPM_REGISTRY
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi \
 && apt-get update -y \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------- 后端：装依赖 → 生成 Prisma Client → nest build ----------
FROM base AS server-build
# 只拷后端清单；前后端各自独立 package.json（非 monorepo）
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --no-audit --no-fund

COPY server/nest-cli.json server/tsconfig.json server/tsconfig.build.json ./server/
COPY server/prisma ./server/prisma
COPY server/scripts ./server/scripts
COPY server/src ./server/src

# 目标数据库：mysql（默认）| sqlite
ARG DB_PROVIDER=mysql
# build-schemas.mjs 由 prisma/src/models.prisma 生成两份 schema，再生成 Client
RUN cd server \
 && node scripts/build-schemas.mjs \
 && npx prisma generate --schema "prisma/${DB_PROVIDER}/schema.prisma" \
 && npm run build

# ---------- 前端：装依赖 → nuxt build（产物 .output 自带运行时依赖） ----------
FROM base AS web-build
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci --no-audit --no-fund

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
#   · dist 编译产物
#   · node_modules —— 这里刻意**不做 --omit=dev 裁剪**：启动时的自动迁移（auto-migrate）
#     依赖 devDependencies 里的 prisma CLI；同时 Prisma Client 是 generate 写进 node_modules 的
#   · prisma/ 与 scripts/ —— 自动迁移要重建 schema 并执行 migrate deploy
COPY --from=server-build /app/server/node_modules ./server/node_modules
COPY --from=server-build /app/server/dist ./server/dist
COPY server/prisma ./server/prisma
COPY server/scripts ./server/scripts

# 前端 .output 是自包含产物，运行期不需要 web/node_modules
COPY --from=web-build /app/web/.output ./web/.output

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# 3000 前端对外；3001 后端（容器内由 Nuxt 代理转发，可不对外暴露）
EXPOSE 3000 3001

ENTRYPOINT ["/app/docker-entrypoint.sh"]
