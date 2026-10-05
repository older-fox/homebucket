# ---- 基础镜像：Prisma 需要 openssl ----
FROM node:22-slim AS base
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- 构建：安装依赖 ----
FROM base AS deps
COPY server/package.json server/package-lock.json ./server/
COPY web/package.json web/package-lock.json ./web/
RUN cd /app/server && npm ci --no-audit --no-fund
RUN cd /app/web && npm ci --no-audit --no-fund

# ---- 构建：编译前后端 ----
FROM base AS build
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY --from=deps /app/web/node_modules ./web/node_modules
COPY server ./server
COPY web ./web

# 目标数据库：mysql（默认）| sqlite
ARG DB_PROVIDER=mysql
ENV DB_PROVIDER=${DB_PROVIDER}

WORKDIR /app/server
RUN npx prisma generate --schema "prisma/${DB_PROVIDER}/schema.prisma"
RUN npm run build

WORKDIR /app/web
RUN npm run build

# ---- 运行：一个容器同时跑前端 + 后端 ----
FROM base AS runtime
ENV NODE_ENV=production
ENV WEB_HOST=0.0.0.0
ENV WEB_PORT=3000
# 容器内数据目录统一放 /data：sqlite 库文件、上传的图片都在这里，挂卷即可持久化
ENV DATA_DIR=/data
ENV UPLOAD_DIR=/data/uploads
VOLUME ["/data"]

# 注意：必须取 build 阶段的 node_modules，Prisma Client 是 generate 时写进去的
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/web/.output ./web/.output
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# 3000 前端对外；3001 后端（容器内由 Nuxt 代理转发，可不对外暴露）
EXPOSE 3000 3001

ENTRYPOINT ["/app/docker-entrypoint.sh"]
