#!/usr/bin/env bash
# 单容器内同时启动 Nest 后端与 Nuxt 前端
set -e

cd /app/server

# 数据库迁移由后端进程启动时自动完成（AUTO_MIGRATE=false 可关闭），这里不再重复执行

echo "[entrypoint] starting backend on :${SERVER_PORT:-3001}"
node dist/main.js &
backend_pid=$!

# Nuxt 生产产物读取 HOST / PORT / NITRO_HOST / NITRO_PORT
export HOST="${WEB_HOST:-0.0.0.0}"
export PORT="${WEB_PORT:-3000}"
export NITRO_HOST="$HOST"
export NITRO_PORT="$PORT"
echo "[entrypoint] starting frontend on ${HOST}:${PORT}"
node /app/web/.output/server/index.mjs &
frontend_pid=$!

# 任意一个进程退出就让容器退出，方便 docker/systemd 重启
wait -n "$backend_pid" "$frontend_pid"
exit $?
