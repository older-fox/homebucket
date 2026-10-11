// 静态引用原生驱动：TypeORM 是**运行期**动态 require('better-sqlite3')，而 Nitro 的依赖
// 追踪（node-file-trace）只跟静态 import —— 看不到动态引用时 .output/server/node_modules
// 里就没有它，容器只 COPY .output（不复制 node_modules）启动即
// "Cannot find module 'better-sqlite3'"。这行只为把追踪器引到这里，运行期仍由 TypeORM 加载；
// 删掉它构建产物就不再自包含（已用"只复制 .output 到空目录再启动"的方式实测过）。
import 'better-sqlite3';

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { env } from '../utils/env';
import { buildDataSourceOptions } from './data-source';
import { applyPragmas } from './pragmas';

/**
 * 数据库生命周期：迁移 → 连接 → pragma，一个进程一条连接。
 *
 * 与迁移前（Nest）的设计保持一致的地方：
 *  · 迁移用一条**短命连接**先跑完，再建正式连接。这样迁移失败时报的是迁移错误，
 *    而不是一堆"DI 初始化失败"，排查成本低得多。
 *  · pragma 在正式连接上执行（会话级设置，必须落在真正在用的那条连接上）。
 *
 * 服务层因此可以同步地拿连接：`const ds = getDataSource()`。
 * 未初始化时直接抛错（而不是隐式连一个库），避免"测试忘了初始化 → 悄悄写到默认库"。
 */

export interface InitDatabaseOptions {
  /** 覆盖库文件路径（测试/脚本用临时库时传） */
  database?: string;
  /** 是否跑迁移，默认取 env.autoMigrate */
  migrate?: boolean;
  /** 迁移日志回调（默认 console.log） */
  log?: (message: string) => void;
}

let current: DataSource | null = null;

function overridesOf(options: InitDatabaseOptions): Partial<DataSourceOptions> {
  return options.database ? { database: options.database } : {};
}

/** 跑迁移（独立短命连接）。返回实际执行的迁移条数。 */
export async function runMigrations(options: InitDatabaseOptions = {}): Promise<number> {
  const dataSourceOptions = buildDataSourceOptions(overridesOf(options));
  const database = String(dataSourceOptions.database ?? '');
  // better-sqlite3 不会替你建目录，缺目录只会报 "unable to open database file"
  if (database && database !== ':memory:') {
    mkdirSync(dirname(database), { recursive: true });
  }
  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();
  try {
    const executed = await dataSource.runMigrations({ transaction: 'all' });
    return executed.length;
  } finally {
    await dataSource.destroy();
  }
}

/** 初始化（或复用）进程内唯一的连接；幂等。 */
export async function initDatabase(options: InitDatabaseOptions = {}): Promise<DataSource> {
  if (current?.isInitialized) return current;
  const log = options.log ?? ((message: string) => console.log(message));
  const migrate = options.migrate ?? env.autoMigrate;
  if (migrate) {
    const executed = await runMigrations(options);
    if (executed > 0) log(`[collector] 已执行 ${executed} 个迁移`);
  }
  const dataSource = new DataSource(buildDataSourceOptions(overridesOf(options)));
  await dataSource.initialize();
  await applyPragmas(dataSource);
  current = dataSource;
  return dataSource;
}

/** 取当前连接。未初始化就抛错 —— 宁可启动失败，也不要偷偷连到别的库上。 */
export function getDataSource(): DataSource {
  if (!current?.isInitialized) {
    throw new Error('数据库尚未初始化：请先 await initDatabase()（服务端由 server/plugins/database.ts 负责）');
  }
  return current;
}

export function isDatabaseReady(): boolean {
  return Boolean(current?.isInitialized);
}

/** 关闭连接（测试收尾、优雅退出）。 */
export async function closeDatabase(): Promise<void> {
  if (current?.isInitialized) {
    await current.destroy();
  }
  current = null;
}
