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

/** baseline 迁移的类名形如 `Init1791302382566`（两方言同名同时间戳） */
const INIT_NAME = /^Init\d+$/;

/** TypeORM 从迁移类名的结尾数字推导 timestamp，这里照做 */
function timestampOf(name) {
  const match = /(\d+)$/.exec(name);
  if (!match) throw new Error(`迁移类名必须以时间戳结尾，无法解析：${name}`);
  return Number(match[1]);
}

/** 从 Init 的 up() 源码里抽出它会建的表名（排除 SQLite 重建用的 temporary_* 中间表） */
function createdTablesOf(init) {
  const source = init.up.toString();
  const names = [...source.matchAll(/CREATE TABLE [`"]?([A-Za-z_][A-Za-z0-9_]*)[`"]?/g)].map((match) => match[1]);
  return [...new Set(names)].filter((name) => !name.startsWith('temporary_'));
}

async function main() {
  await dataSource.initialize();
  // 用 data-source 自己解析出来的方言，而不是再读一次 process.env：两者不一致时，
  // 以前会拿默认值 mysql 去日志里报，实际却按 sqlite 的 glob 加载迁移，日志完全对不上。
  const dialect = dataSource.options.type === 'better-sqlite3' ? 'sqlite' : 'mysql';
  const table = dataSource.options.migrationsTableName ?? 'migrations';

  try {
    // showMigrations() 会顺带把 migrations 记录表建出来（如果还没有）
    await dataSource.showMigrations();

    const loaded = dataSource.migrations.map((migration) => migration.name);
    const executedRows = await dataSource.query(`SELECT name FROM ${table}`);
    const executed = new Set(executedRows.map((row) => row.name));
    const pending = loaded.filter((name) => !executed.has(name));

    if (pending.length === 0) {
      console.log(`[baseline] provider=${dialect} 没有待登记的迁移，无需操作`);
      return;
    }

    // 只登记 baseline（Init）本身；后续的增量迁移必须留给 db:run / 启动时的自动迁移去真正执行。
    // 这里用锚定的名字正则而不是 startsWith('Init')：将来若新增一个叫 InitSomething 的迁移，
    // 前缀匹配会把它也登记成"已执行"却永远不跑它的 DDL。
    const baselines = pending.filter((name) => INIT_NAME.test(name));
    const increments = pending.filter((name) => !INIT_NAME.test(name));

    if (baselines.length === 0) {
      console.log(
        `[baseline] 没有待登记的 baseline 迁移（待执行的增量迁移有 ${increments.length} 个，请用 npm run db:run）`,
      );
      return;
    }
    if (baselines.length > 1) {
      console.error(
        `[baseline] 拒绝执行：同时匹配到多个 baseline 迁移（${baselines.join(', ')}）。\n` +
          '          一个方言只应有一个 Init，请先整理迁移文件。',
      );
      process.exitCode = 1;
      return;
    }

    const init = dataSource.migrations.find((migration) => INIT_NAME.test(migration.name));

    const runner = dataSource.createQueryRunner();
    let existingTables = [];
    try {
      // 过滤掉 sqlite_* 内部表（sqlite_sequence 是 AUTOINCREMENT 自动建的）与 TypeORM 自己的
      // migrations 表：否则一个完全空的 sqlite 库也会被当成"有业务表"，于是走到结构校验分支，
      // 报出误导性的"缺少 Init 会建的表"而不是"空库请直接 db:run"。
      existingTables = (await runner.getTables())
        .map((t) => t.name)
        .filter((name) => name !== table && !name.startsWith('sqlite_'));
    } finally {
      await runner.release();
    }
    const appTables = existingTables;

    // 必须确认这是"表已经存在的老库"：空库应该正常跑迁移建表，而不是跳过
    if (appTables.length === 0) {
      console.error(
        '[baseline] 拒绝执行：库里没有任何业务表。\n' +
          '          空库请直接 npm run db:run（或让服务启动时自动迁移），不要用 baseline',
      );
      process.exitCode = 1;
      return;
    }

    // 还要确认这个库的结构确实是 Init 会建出来的：只判断"非空"远远不够，
    // 误连到别的应用的库时，光看非空会照样登记，之后 db:run 反而去建重复的表。
    const wantedTables = createdTablesOf(init);
    const existing = new Set(existingTables);
    const missing = wantedTables.filter((name) => !existing.has(name));
    if (missing.length > 0) {
      console.error(
        `[baseline] 拒绝执行：库里缺少 Init 会建的表：${missing.join(', ')}。\n` +
          `          已存在的表里 Init 需要的只有 ${wantedTables.length - missing.length}/${wantedTables.length} 个，\n` +
          '          说明这不是「表已建好、只差迁移记录」的老库。请用 npm run db:run 正常建表。',
      );
      process.exitCode = 1;
      return;
    }

    for (const name of baselines) {
      await dataSource.query(`INSERT INTO ${table} (timestamp, name) VALUES (?, ?)`, [timestampOf(name), name]);
      console.log(`[baseline] 已登记（不执行 DDL）：${name}`);
    }
    console.log(`[baseline] provider=${dialect} 完成，现有表保持原样未做任何改动`);

    if (increments.length > 0) {
      console.log(
        `[baseline] 注意：还有 ${increments.length} 个待执行的增量迁移（${increments.join(', ')}）。\n` +
          '          请执行 npm run db:run 应用它们（服务启动时 AUTO_MIGRATE=true 也会自动执行）。',
      );
    }

    // 这条警告很重要：baseline 是"直接往 migrations 表插记录"，TypeORM 并不知道 Init 没真正执行过。
    // 因此 `npm run db:revert` 会去执行 Init 的 down()，而它期望的是 TypeORM 自己建出来的结构。
    console.log(
      '[baseline] ⚠️  不要用 npm run db:revert 来"撤销"这次登记。\n' +
        '          baseline 只是写入记录，TypeORM 不知道 Init 没真正跑过，revert 会去执行 Init 的 down()：\n' +
        '          mysql 侧它期望 TypeORM 命名的外键（FK_<hash>），会以 "Can\'t DROP ... check that column/key exists" 失败；\n' +
        '          sqlite 侧的 down() 现在就是按依赖顺序 DROP TABLE，会真的把表删掉。\n' +
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
