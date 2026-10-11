#!/usr/bin/env node
/**
 * 生产启动入口：把收集器的配置名接给 Nitro。
 *
 * 收集器对外一直用 COLLECTOR_PORT / COLLECTOR_HOST（文档、部署脚本、健康检查都按它写），
 * 而 Nitro 的 node-server 只认 PORT / NITRO_PORT / HOST。两边名字不一样，
 * 与其到处改文档，不如在这里转一次：`node scripts/start.mjs` 就是全部启动命令。
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const entry = resolve(process.cwd(), '.output/server/index.mjs');
if (!existsSync(entry)) {
  console.error('找不到 .output/server/index.mjs：请先执行 npm run build');
  process.exit(1);
}

const env = { ...process.env };

/**
 * 读 collector/.env 并只填**没有**的值。
 *
 * 开发态（nuxt dev）会自己加载 .env，但构建产物 `.output/server/index.mjs` 不会 ——
 * 如果这里不补一次，`npm start` 会静默用默认值（比如忘了 COLLECTOR_ADMIN_TOKEN 的生产校验）。
 * 与 dotenv 的行为对齐：不覆盖已存在的环境变量（`docker run -e` 优先于 .env 文件）。
 */
function loadEnvFile() {
  const file = resolve(process.cwd(), '.env');
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(rawLine);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (env[key] !== undefined) continue;
    const value = rawValue.replace(/^(['"])(.*)\1$/, '$2').replace(/\\n/g, '\n');
    env[key] = value;
  }
}

loadEnvFile();

const port = (env.COLLECTOR_PORT ?? '').trim() || '3400';
const host = (env.COLLECTOR_HOST ?? '').trim() || '0.0.0.0';
env.PORT = port;
env.NITRO_PORT = port;
env.HOST = host;
env.NITRO_HOST = host;

const child = spawn(process.execPath, [entry], { stdio: 'inherit', env });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
