# syntax=docker/dockerfile:1
# ↑ 固定 BuildKit 前端版本：下面 RUN 里的 --mount=type=cache 只有 BuildKit 认识；
#   kaniko 把这行当注释跳过，本地 docker build 走新版前端，两边语法一致。

# HomeBucket 收集器镜像：**一个进程**同时提供页面（Nuxt SSR）与 API（Nitro）。
#
# 写法与根仓库 Dockerfile 保持一致（多阶段、按需 COPY、npm 缓存挂载），并沿用两条踩坑结论：
#   1. `base` 阶段**刻意不放 WORKDIR** —— 它会让 kaniko 的层缓存对所有子阶段失效
#      （WORKDIR 建目录 → 目录 mtime 每次都不同 → 父层 digest 变 → 子阶段 cache key 全重算）。
#      实测差 3 倍构建时间、3.6 倍内存峰值。WORKDIR 一律写在具体用它的阶段里。
#   2. `npm ci --ignore-scripts`：better-sqlite3 带 binding.gyp，npm 默认会补跑一次
#      `node-gyp rebuild`，而 slim 镜像里没有 python3/make/g++。跳过安装脚本是安全的，
#      因为 **13.x 的 tarball 自带各平台预编译产物**（prebuilds/ 下有 8 个 .node，
#      运行期 lib/binding.js 直接 require 它们）。
#      ⚠️ 不要把依赖降回 12.x：12.11.1 的 tarball 里一个 .node 都没有，二进制要靠安装
#      脚本里的 prebuild-install 从 GitHub 下载；`--ignore-scripts` 下镜像照样能构建成功，
#      但容器一启动就 `Could not locate the bindings file`，/api/health 直接 500。
#      （本仓库实际踩过这一跤 —— 只看 `docker build` 退出码是发现不了的。）

# 基础镜像：Node 24 LTS（与开发机 v24.21.0 一致；nuxt 4 要求 ^22.22.3 || ^24.15.0 || >=26）。
# 可换成加速域名：--build-arg NODE_IMAGE=docker.1ms.run/library/node:24-bookworm-slim
ARG NODE_IMAGE=node:24-bookworm-slim

# ---------- 基础层：只有 npm 配置 ----------
FROM ${NODE_IMAGE} AS base
ARG NPM_REGISTRY=""
RUN set -eu; \
    npm config set update-notifier false; \
    if [ -n "${NPM_REGISTRY:-}" ]; then npm config set registry "$NPM_REGISTRY"; fi

# ---------- 构建：装依赖 → nuxt build（产物 .output 自包含） ----------
FROM base AS build
WORKDIR /app
# 关掉 Nuxt telemetry：构建阶段不要往外发匿名统计，CI 里也少一次网络请求。
# 这里刻意不设 NODE_ENV=production：那样 npm 默认 omit=dev，而 nuxt build 需要 devDependencies。
ENV NUXT_TELEMETRY_DISABLED=1
# 清单放在源码之前：只要 package.json / package-lock.json 没变，这一层就一直命中缓存。
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts --no-audit --no-fund

# 源码在依赖之后 COPY：改业务代码不会让依赖层失效。
# public/ 与 app/ 是前端资源，server/ 是 Nitro 接口，nuxt.config.ts 同时管两边。
# i18n/ 必须在**构建阶段**就位：nuxt-i18n 要读 locales/*.json 算 hash 再交给打包器，
# 语言包最终被内联进 .output/server/chunks/raw/*.mjs —— 缺了这个目录，nuxt build
# 会在 "Setting up modules" 阶段直接 ENOENT: app/i18n/locales/en.json 失败。
# 运行期不再需要它（内容已在产物里），所以 runtime 阶段不 COPY。
# 根 Dockerfile 的 web 阶段有对应的一行，两边保持同一套清单。
COPY nuxt.config.ts tsconfig.json ./
COPY app ./app
COPY server ./server
COPY public ./public
COPY i18n ./i18n
RUN npm run build

# ---------- 运行：单进程，页面 + API 同一个端口 ----------
FROM base AS runtime
WORKDIR /app
# 生产环境强制要求 COLLECTOR_ADMIN_PASSWORD（≥8 字符，env.ts 里会直接抛错拒绝启动）：
# 一个连管理员都建不出来的收集器 = 启动即死，而一个没有口令的收集器 = 任何人都能改公共资料、
# 封别人的实例，所以这里不给默认值。账号名默认 admin，可用 COLLECTOR_ADMIN_USERNAME 覆盖。
# 首次启动（库里还没有管理员）时按这两项建号；之后在纠错台里改密码即可，
# .env 里的口令不会覆盖已改过的密码（要强制改回用 COLLECTOR_ADMIN_FORCE_RESET=true）。
ENV NODE_ENV=production \
    COLLECTOR_HOST=0.0.0.0 \
    COLLECTOR_PORT=3400 \
    COLLECTOR_DB_FILE_PATH=/data/collector.db

# .output 是 Nitro 的自包含产物：服务端依赖（含 better-sqlite3 的预编译 .node）都在里面，
# 运行期不需要 node_modules，也不需要完整的源码树。
COPY --from=build /app/.output ./.output
# scripts/start.mjs 只做一件事：把 COLLECTOR_PORT/HOST 翻译成 Nitro 认的 PORT/HOST 再启动
COPY scripts ./scripts
COPY package.json ./package.json

# 非 root 运行：node:24 镜像自带 uid/gid 1000 的 `node` 用户，直接用它
#（README 里说 bind mount 要先 `chown 1000:1000` 指的就是它）。
# /data 在镜像里就建好并 chown：**具名卷**首次挂载会继承镜像内目录的属主，
# 而 bind mount 用的是宿主机目录的属主，那种情况只能由部署者自己 chown。
# 顺序有意如此：先 COPY（root 写入），再统一 chown，最后才切 USER —— 反过来的话
# COPY 进容器的文件仍归 root，非 root 进程会读不到自己 .output 里的东西。
RUN mkdir -p /data && chown -R node:node /data /app
USER node

# SQLite 库文件放 /data，挂卷即持久化
VOLUME ["/data"]

EXPOSE 3400

# 用 node 自带的 fetch 打健康检查：不额外装 curl/wget，镜像保持单一运行时
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.COLLECTOR_PORT||3400)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "scripts/start.mjs"]
