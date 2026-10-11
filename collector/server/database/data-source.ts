import { DataSource, type DataSourceOptions } from 'typeorm';
import { env } from '../utils/env';
import { entities } from './entities';
import { migrations } from './migrations';

/**
 * 数据源定义：运行时连接与 db:check-drift 脚本共用同一份配置。
 *
 * `synchronize` 永远关闭：表结构只能由迁移改。收集器是长期存公共资料的库，
 * "让 ORM 自动对齐表结构"等于把数据命运交给一次误提交。
 *
 * 测试/脚本可以传 overrides 换库文件（例如临时库），不必改 env。
 */
export function buildDataSourceOptions(
  overrides: Partial<DataSourceOptions> = {},
): DataSourceOptions {
  return {
    type: 'better-sqlite3',
    database: env.dataFile,
    entities,
    migrations,
    migrationsTableName: 'migrations',
    migrationsRun: false,
    synchronize: false,
    logging: false,
    ...overrides,
  } as DataSourceOptions;
}
