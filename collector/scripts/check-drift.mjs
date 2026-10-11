#!/usr/bin/env node
/**
 * 漂移检查（与迁移前的 `npm run db:check-drift` 同义）：
 * 在一个全新的临时 SQLite 库上跑完迁移，然后让 TypeORM 比一遍
 * "实体定义"与"迁移建出来的表结构"。**必须零差异**。
 *
 * 为什么要有这个检查：迁移是手写的，实体是另一份描述，两者漂移的表现是
 * "测试全绿但生产少一列"。在这里失败，比上线后才发现便宜得多。
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../server/database/data-source.ts';

const dir = mkdtempSync(join(tmpdir(), 'hbcol-drift-'));
const database = join(dir, 'drift.db');
const dataSource = new DataSource(buildDataSourceOptions({ database }));

try {
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: 'all' });
  const sql = await dataSource.driver.createSchemaBuilder().log();
  const statements = [...sql.upQueries.map((query) => query.query), ...sql.downQueries.map((query) => query.query)];
  if (statements.length === 0) {
    console.log(`[drift] OK：${database} 上迁移与实体定义完全一致`);
  } else {
    console.error(`[drift] 发现 ${statements.length} 处漂移，需要补一条迁移：`);
    for (const statement of statements) console.error(`  ${statement};`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error('[drift] 检查失败：', error);
  process.exitCode = 1;
} finally {
  await dataSource.destroy().catch(() => {});
  rmSync(dir, { recursive: true, force: true });
}
