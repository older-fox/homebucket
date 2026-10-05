// Prisma CLI 包装：读取根目录 .env，按 DB_PROVIDER 选择 schema，并先重建两份 schema。
// 用法：node scripts/prisma.mjs <prisma 子命令...>，例如 node scripts/prisma.mjs migrate deploy
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: resolve(root, '../.env') });

const provider = (process.env.DB_PROVIDER ?? 'mysql').toLowerCase() === 'sqlite' ? 'sqlite' : 'mysql';
const schema = `prisma/${provider}/schema.prisma`;

const build = spawnSync(process.execPath, [resolve(root, 'scripts/build-schemas.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status ?? 1);

const cli = resolve(root, 'node_modules/prisma/build/index.js');
const args = [...process.argv.slice(2), '--schema', schema];
console.log(`[prisma] provider=${provider} → ${args.join(' ')}`);

const result = spawnSync(process.execPath, [cli, ...args], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);
