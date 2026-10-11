import '../config/load-env';
import { join } from 'node:path';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { env } from '../config/env';
import { entities } from '../entities';

/**
 * 数据源定义：**同时**是运行时连接与 typeorm CLI（db:* 脚本）的入口。
 *
 * 与 HomeBucket 主服务同一套路子：只允许 default 导出一个 DataSource，CLI 用 -d 指向它。
 * 区别是运行时连接由 app.module 调 buildDataSourceOptions() 组装，
 * 这样测试可以换库文件（换 COLLECTOR_DB_FILE_PATH）而不必改代码。
 *
 * `synchronize` 永远关闭：表结构只能由迁移改。收集器是长期存公共资料的库，
 * "让 ORM 自动对齐表结构"等于把数据命运交给一次误提交。
 */
export function buildDataSourceOptions(
  overrides: Partial<DataSourceOptions> = {},
): DataSourceOptions {
  return {
    type: 'better-sqlite3',
    database: env.dataFile,
    entities,
    // 迁移按方言分目录（v1 只有 sqlite）；同时匹配 .ts（ts-node 跑 CLI）与 .js（dist 里跑）
    migrations: [join(__dirname, 'migrations', env.dbProvider, '*{.js,.ts}')],
    migrationsTableName: 'migrations',
    migrationsRun: false,
    synchronize: false,
    logging: false,
    ...overrides,
  } as DataSourceOptions;
}

export default new DataSource(buildDataSourceOptions());
