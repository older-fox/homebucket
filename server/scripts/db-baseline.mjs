#!/usr/bin/env node
/**
 * 把"表结构已经存在、但还没有 TypeORM 迁移记录"的库登记为已执行 baseline 迁移。
 *
 * 使用场景：从 Prisma 迁移过来的老库。表是 Prisma 建的，数据都在，
 * 只是没有 TypeORM 的 `migrations` 记录表。直接 `migration:run` 会试图重新建表并失败，
 * 所以需要先把 baseline 标记成"已执行"，但**不真正跑它的 DDL**。
 *
 * ⚠️ 需要先 `npm run build`：该脚本跑编译产物（dist/），这样它既能用在开发机，
 * 也能直接用在只装了生产依赖的容器里。
 *
 * 用法：npm run db:baseline
 */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: resolve(root, '../.env') });

const require = createRequire(import.meta.url);
const dataSource = require(resolve(root, 'dist/database/data-source.js')).default;

/** TypeORM 从迁移类名的结尾数字推导 timestamp，这里照做 */
function timestampOf(name) {
  const match = /(\d+)$/.exec(name);
  if (!match) throw new Error(`迁移类名必须以时间戳结尾，无法解析：${name}`);
  return Number(match[1]);
}

async function main() {
  const provider = process.env.DB_PROVIDER ?? 'mysql';
  await dataSource.initialize();
  const table = dataSource.options.migrationsTableName ?? 'migrations';

  try {
    // showMigrations() 会顺带把 migrations 记录表建出来（如果还没有）
    await dataSource.showMigrations();

    const loaded = dataSource.migrations.map((migration) => migration.name);
    const executedRows = await dataSource.query(`SELECT name FROM ${table}`);
    const executed = new Set(executedRows.map((row) => row.name));
    const pending = loaded.filter((name) => !executed.has(name));

    if (pending.length === 0) {
      console.log(`[baseline] provider=${provider} 没有待登记的迁移，无需操作`);
      return;
    }

    // 只登记 baseline（Init*）本身；后续的增量迁移必须留给 db:run / 启动时的自动迁移去真正执行
    const baselines = pending.filter((name) => name.startsWith('Init'));
    const increments = pending.filter((name) => !name.startsWith('Init'));

    if (baselines.length === 0) {
      console.log(
        `[baseline] 没有待登记的 baseline 迁移（待执行的增量迁移有 ${increments.length} 个，请用 npm run db:run）`,
      );
      return;
    }

    // 必须确认这是"表已经存在的老库"：空库应该正常跑迁移建表，而不是跳过
    const runner = dataSource.createQueryRunner();
    let existingTables = [];
    try {
      existingTables = (await runner.getTables()).map((t) => t.name);
    } finally {
      await runner.release();
    }
    const appTables = existingTables.filter((name) => name !== table);
    if (appTables.length === 0) {
      console.error(
        '[baseline] 拒绝执行：库里没有任何业务表。\n' +
          '          空库请直接 npm run db:run（或让服务启动时自动迁移），不要用 baseline',
      );
      process.exitCode = 1;
      return;
    }

    for (const name of baselines) {
      await dataSource.query(`INSERT INTO ${table} (timestamp, name) VALUES (?, ?)`, [timestampOf(name), name]);
      console.log(`[baseline] 已登记（不执行 DDL）：${name}`);
    }
    console.log(`[baseline] provider=${provider} 完成，现有表保持原样未做任何改动`);

    if (increments.length > 0) {
      console.log(
        `[baseline] 注意：还有 ${increments.length} 个待执行的增量迁移（${increments.join(', ')}）。\n` +
          '          请执行 npm run db:run 应用它们（服务启动时 AUTO_MIGRATE=true 也会自动执行）。',
      );
    }

    // 这条警告很重要：baseline 是"直接往 migrations 表插记录"，TypeORM 并不知道 Init 没真正执行过。
    // 因此 `npm run db:revert` 会去执行 Init 的 down()，而它期望的是 TypeORM 命名的外键。
    console.log(
      '[baseline] ⚠️  不要用 npm run db:revert 来"撤销"这次登记。\n' +
        '          baseline 只是写入记录，TypeORM 不知道 Init 没真正跑过，revert 会去执行 Init 的 down()，\n' +
        '          而它期望的是 TypeORM 命名的外键（FK_<hash>）。在老库上这会以\n' +
        '          "Can\'t DROP ... FK_<hash>; check that column/key exists" 失败——\n' +
        '          好在 down() 把 DROP TABLE 放在最后，会在这之前就中断，所以表和数据都不会被删。\n' +
        '          要退回 Prisma 时代的状态，请用备份恢复（server/data/backup/ 里的 dump）。',
    );
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error('[baseline] 失败：', error instanceof Error ? error.message : error);
  process.exit(1);
});
