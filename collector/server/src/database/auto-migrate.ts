import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DataSource } from 'typeorm';
import { env } from '../config/env';
import { buildDataSourceOptions } from './data-source';

/**
 * 启动前跑迁移（在 NestFactory.create 之前，用一条独立的临时连接）。
 *
 * 为什么不用 TypeORM 的 migrationsRun: true —— 那会让迁移在 Nest 容器初始化过程中执行，
 * 迁移失败时你看到的是"DI 报错"而不是"迁移报错"，排查成本高。先用一个短命 DataSource
 * 跑完、日志清清楚楚，再启动 HTTP 服务。
 *
 * 为什么在这里 mkdir —— 默认库路径是 data/collector.db，而 data/ 是 .gitignore 掉的
 * （里面是运行时数据）。新克隆 / 新容器里这个目录不存在，better-sqlite3 不会替你建目录，
 * 只会报 "unable to open database file"。
 */
export async function runMigrations(): Promise<number> {
  if (env.dbProvider === 'sqlite') {
    mkdirSync(dirname(env.dataFile), { recursive: true });
  }
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();
  try {
    const executed = await dataSource.runMigrations({ transaction: 'all' });
    return executed.length;
  } finally {
    await dataSource.destroy();
  }
}
