import 'reflect-metadata';
import { join, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { entities } from '../entities';
import { env } from '../config/env';

// 本文件既是 Nest 的数据源工厂，也是 TypeORM CLI（db:run / db:generate / db:revert /
// db:show）的入口。CLI 不经过 main.ts，必须自己加载仓库根目录的 .env，
// 否则 DATABASE_URL / DB_* 一律读不到，会退化成 127.0.0.1:3306 导致连接被拒。
// dotenv 默认不覆盖已有变量，应用启动时 main.ts 已加载过，这里重复调用无副作用。
loadEnv({ path: resolve(process.cwd(), '../.env') });

/**
 * 迁移文件按 provider 分目录。
 *
 * 为什么不能共用一套：MySQL 与 SQLite 的 DDL 方言差别很大（自增、类型名、
 * ALTER 语法、时间默认值都不一样），一套迁移脚本不可能两边都跑得通。
 * 实体是共享的唯一来源，迁移则各存一份。
 */
function migrationsGlob(provider: 'mysql' | 'sqlite'): string {
  return join(__dirname, 'migrations', provider, `*{.js,.ts}`);
}

/** 两个 provider 共有的配置 */
function sharedOptions(provider: 'mysql' | 'sqlite'): Partial<DataSourceOptions> {
  return {
    entities,
    migrations: [migrationsGlob(provider)],
    // 迁移记录表沿用 TypeORM 默认名。老库里的 _prisma_migrations 保留不动（无害，也不再被读取）
    migrationsTableName: 'migrations',
    // 一个迁移失败就整批回滚，避免半套 schema
    migrationsTransactionMode: 'all',
    // 绝不用 synchronize 改生产库：所有结构变更一律走迁移文件
    synchronize: false,
    // 迁移由 main.ts 在启动时显式执行（见 database/auto-migrate.ts），这里不开自动跑，
    // 好处是能打印出到底执行了哪些迁移
    migrationsRun: false,
  };
}

/**
 * 按 DB_PROVIDER 组装 TypeORM 数据源配置。
 *
 * Nest 的 TypeOrmModule 与 CLI（db:* 脚本）都调用这一个函数，
 * 保证运行期与命令行看到的连接参数完全一致。
 */
export function buildDataSourceOptions(): DataSourceOptions {
  const provider = env.dbProvider;
  const shared = sharedOptions(provider);

  if (provider === 'sqlite') {
    return {
      ...(shared as object),
      type: 'better-sqlite3',
      database: env.sqliteFile,
      // WAL 提升并发读性能；SQLite 是单写多读，配合 busy timeout 减少 SQLITE_BUSY
      enableWAL: true,
      timeout: 5000,
    } as DataSourceOptions;
  }

  const connection = env.mysqlConnection;
  return {
    ...(shared as object),
    type: 'mysql',
    host: connection.host,
    port: connection.port,
    username: connection.username,
    password: connection.password,
    database: connection.database,
    charset: 'utf8mb4',
    // 显式锁 UTC：Prisma 时代就是用 UTC 存 DateTime，
    // 若不指定而 MySQL 服务器时区变了，新旧数据的时刻会整体偏移
    timezone: 'Z',
    // 关键：MySQL 的 DECIMAL 会以字符串返回，精度由实体上的 decimalNumber transformer 处理，
    // 这里不开 decimalNumbers（那会丢精度）
    poolSize: 10,
  } as DataSourceOptions;
}

/**
 * CLI 专用数据源实例。
 *
 * ⚠️ TypeORM 的 data-source 文件要求**恰好导出一个** DataSource 实例：
 * 既不能同时写 `export const x` + `export default x`（会报
 * "must contain only one export of DataSource instance"），也不能一个都不导出。
 * 所以这里只保留 default 导出，Nest 那边另走 TypeOrmModule.forRootAsync 自己建实例。
 */
const dataSource = new DataSource(buildDataSourceOptions());

export default dataSource;
