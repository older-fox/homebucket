#!/usr/bin/env node
/**
 * 结构漂移检查：在一个全新的临时 SQLite 库上跑完全部迁移，再用 TypeORM 的 `schema:log`
 * 比对「实体元数据」与「迁移建出来的库结构」是否一致。
 *
 * 为什么值得做成脚本：实体改了但忘了写迁移（或迁移里列类型/长度/索引与实体不一致）时，
 * `migration:run` 与 `nest build` 都不会报错，只会在生产上以"列不存在 / 类型不对"的形式爆出来。
 * `schema:log` 是唯一能在 CI 里零外部依赖跑起来的探针 —— MySQL 需要真实实例，SQLite 不需要。
 *
 * 用法：`npm run db:check-drift`（退出码 0 = 零漂移）
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataSource = join('src', 'database', 'data-source.ts');

const dir = mkdtempSync(join(tmpdir(), 'hb-drift-'));
const currentDb = join(dir, 'drift.db');
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));

/** `npx --no-install` 让这个脚本在 CI 与本地都用同一份本地安装的 CLI，不去联网找包 */
function typeorm(...args) {
  return spawnSync(
    'npx',
    ['--no-install', 'typeorm-ts-node-commonjs', ...args, '--dataSource', dataSource],
    {
      cwd: serverDir,
      encoding: 'utf8',
      env: { ...process.env, DB_PROVIDER: 'sqlite', DB_FILE_PATH: currentDb },
    },
  );
}

const run = typeorm('migration:run');
if (run.status !== 0) {
  console.error('[drift] migration:run 失败：');
  console.error(run.stdout || '', run.stderr || '');
  process.exit(1);
}

const log = typeorm('schema:log');
const output = `${log.stdout ?? ''}${log.stderr ?? ''}`;
if (log.status !== 0) {
  console.error('[drift] schema:log 执行失败：');
  console.error(output);
  process.exit(1);
}

// TypeORM 零漂移时的原话；有漂移时会打印 "Schema synchronization will execute following sql queries (N):"
if (!output.includes('there are no queries to be executed by schema synchronization')) {
  console.error('[drift] 实体与迁移建出的库结构不一致（schema:log 非空）：');
  console.error(output.trim());
  process.exit(1);
}

console.log('[drift] OK：全新 SQLite 库跑完迁移后 schema:log 零漂移');
