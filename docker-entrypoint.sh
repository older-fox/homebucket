#!/usr/bin/env bash
# 单容器内同时启动 Nest 后端与 Nuxt 前端，并**监管后端**。
#
# ── 为什么要监管（而不是原来的 `wait -n` 一把梭）──
# 首启引导里，用户在页面上填完数据库连接后，后端会把参数写到 /data/db.config.json
# 并以 75 退出（连接参数只能在启动期读，改进程内没用）。这时必须**只把后端重启起来**，
# 前端继续服务 —— 它正在渲染引导页，重启它等于把用户正在填的表单弄没了。
# 而原脚本 wait -n 之后就直接 exit，容器会整体退出；指望 Docker 的 restart 策略
# 就又要求部署方必须配 --restart（没配就停在那儿了，用户看到的是"点保存后网页打不开"）。
# 所以把重启做在容器内：退出码 75 → 重启后端；其他退出码 → 按原语义让容器退出。
#
# ── PID 1 与信号 ──
# 本脚本是容器的 PID 1，而 bash 默认不会把 SIGTERM 转发给子进程 —— 不装 trap 的话
# `docker stop` 会让两个 node 进程被 SIGKILL（来不及落盘/关连接）。所以下面 trap 了
# TERM/INT 并显式转发。
set -eu

cd /app/server

# 数据库迁移由后端进程启动时自动完成（AUTO_MIGRATE=false 可关闭），这里不再重复执行

backend_pid=''
frontend_pid=''
watcher_pid=''

# "子进程意外退出"的标记文件：监视器发现前端没了就写它，shutdown 据此决定退出码。
# 放 /tmp 是因为容器里它一定可写；万一不可写，最坏结果是退出码为 0（可接受）。
# **启动时必须清掉**：否则上一轮留下的标记会让这次的"人为停止"也变成非 0
#（/tmp 被挂卷复用时就会这样，而那会让 `restart: on-failure` 一直重启一个正常停掉的容器）。
UNCLEAN_MARKER=/tmp/.homebucket-unclean-exit
rm -f "$UNCLEAN_MARKER" 2>/dev/null || true

shutdown() {
  # 忽略后续信号，避免"退出过程中又被 TERM 打断"，让下面的清理能跑完
  trap '' TERM INT
  # 先停掉监视器：它只是轮询前端是否还活着，我们在下面主动杀前端，
  # 不先停它会打印一条误导性的"前端已退出"，还会再发一次 TERM
  [ -n "$watcher_pid" ] && kill -TERM "$watcher_pid" 2>/dev/null || true
  [ -n "$frontend_pid" ] && kill -TERM "$frontend_pid" 2>/dev/null || true
  [ -n "$backend_pid" ] && kill -TERM "$backend_pid" 2>/dev/null || true
  # 等子进程收尾；它们可能已经不在了，所以不能因 wait 非零而退出
  wait 2>/dev/null || true

  # 只有"人为停止（TERM/INT）"才以 0 退出；子进程意外死掉时**非 0**，
  # 这样 `docker run --restart=on-failure` 才还会把容器拉起来（原脚本 `exit $?` 也是这个语义）。
  local code=0
  [ -f "$UNCLEAN_MARKER" ] && code=1
  exit "$code"
}
trap shutdown TERM INT

# Nuxt 生产产物读取 HOST / PORT / NITRO_HOST / NITRO_PORT
export HOST="${WEB_HOST:-0.0.0.0}"
export PORT="${WEB_PORT:-3000}"
export NITRO_HOST="$HOST"
export NITRO_PORT="$PORT"
echo "[entrypoint] starting frontend on ${HOST}:${PORT}"
node /app/web/.output/server/index.mjs &
frontend_pid=$!

# 前端一旦退出，容器就该退出（与原 `wait -n` 语义一致）。
# 用轮询而不是 `wait`：子 shell 里 wait 不了父 shell 的子进程。
(
  while kill -0 "$frontend_pid" 2>/dev/null; do sleep 3; done
  echo "[entrypoint] 前端已退出，容器即将退出"
  : > "$UNCLEAN_MARKER" 2>/dev/null || true
  kill -TERM $$ 2>/dev/null || true
) &
watcher_pid=$!

# 后端循环：正常退出/崩溃 → 容器退出；退出码 75 → 按新配置重启
while true; do
  echo "[entrypoint] starting backend on :${SERVER_PORT:-3001}"
  # set -e 下 node 非零会直接中断脚本，所以这里临时关掉，自己接退出码
  set +e
  node dist/main.js &
  backend_pid=$!
  wait "$backend_pid"
  code=$?
  set -e
  backend_pid=''

  if [ "$code" -eq 75 ]; then
    echo "[entrypoint] 数据库配置已更新（exit 75），正在按新配置重启后端…"
    continue
  fi

  echo "[entrypoint] 后端退出（code=${code}），容器退出"
  break
done

kill -TERM "$frontend_pid" 2>/dev/null || true
wait "$frontend_pid" 2>/dev/null || true
exit "${code:-1}"
