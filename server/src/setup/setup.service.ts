import { BadRequestException, Injectable } from '@nestjs/common';
import { chmodSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { dbConfigFilePath, dbFileConfig, env, pinnedValue } from '../config/env';
import { isLockedDown } from '../common/container';
import type { DatabaseConfigDto } from './dto';

/** 对外展示的连接摘要（**永远不含密码**） */
export interface DatabaseSummary {
  provider: 'mysql' | 'sqlite';
  /** 当前这些值是从哪来的 */
  source: 'file' | 'env' | 'default';
  host?: string;
  port?: number;
  username?: string;
  database?: string;
  filePath?: string;
  /** 连接串里是否带密码（只回布尔，不回值） */
  hasPassword?: boolean;
  /**
   * 数据位置是否被容器钉死（= /data）。
   * 前端靠它把"SQLite 库文件路径"显示成只读并说明原因 —— 否则用户会改一个
   * **会被服务端忽略**的路径，还以为改成功了。
   */
  lockedStorage?: boolean;
}

export interface NormalizedDatabase {
  provider: 'mysql' | 'sqlite';
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  filePath?: string;
}

const CONNECT_TIMEOUT_MS = 3000;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * 首启引导里与数据库有关的三件事：展示当前连接、测试连接、把连接落盘。
 *
 * **不注入任何 Repository** —— 它要在"连不上数据库"的受限启动模式下工作，
 * 那时 DI 里根本没有数据源（见 setup-restricted.module.ts）。谁需要查库，谁自己带。
 */
@Injectable()
export class SetupService {
  /**
   * 当前生效的连接参数（引导页第 1 步用来预填/展示）。
   * 密码一律不返回，只回"有没有设"。
   */
  summary(): DatabaseSummary {
    const fromFile = dbFileConfig();
    const source: DatabaseSummary['source'] = fromFile
      ? 'file'
      : process.env.DATABASE_URL || process.env.DB_PROVIDER || process.env.DB_HOST || process.env.DB_FILE_PATH
        ? 'env'
        : 'default';

    const lockedStorage = isLockedDown();

    if (env.dbProvider === 'sqlite') {
      return { provider: 'sqlite', source, filePath: env.sqliteFile, lockedStorage };
    }

    const connection = env.mysqlConnection;
    return {
      provider: 'mysql',
      source,
      host: connection.host,
      port: connection.port,
      username: connection.username,
      database: connection.database,
      hasPassword: connection.password !== '',
      lockedStorage,
    };
  }

  /** 把界面上填的参数规范化；不合法直接抛 `setup.databaseInvalid` */
  normalize(dto: DatabaseConfigDto): NormalizedDatabase {
    const provider = dto.provider === 'sqlite' ? 'sqlite' : dto.provider === 'mysql' ? 'mysql' : null;
    if (!provider) {
      throw new BadRequestException({ code: 'setup.databaseInvalid', message: '请选择数据库类型' });
    }

    if (provider === 'sqlite') {
      // 容器内库文件被钉死在 /data（用户改也没用，这里直接按钉死值走，界面也不给改）
      const pinned = pinnedValue('DB_FILE_PATH');
      const filePath = pinned ?? (isNonEmptyString(dto.filePath) ? dto.filePath.trim() : '');
      if (!filePath) {
        throw new BadRequestException({ code: 'setup.databaseInvalid', message: '请填写 SQLite 数据库文件路径' });
      }
      return { provider, filePath: isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath) };
    }

    const url = isNonEmptyString(dto.url) ? dto.url.trim() : undefined;
    if (url && !/^mysql:\/\//i.test(url)) {
      throw new BadRequestException({ code: 'setup.databaseInvalid', message: '连接串需要以 mysql:// 开头' });
    }

    const port = dto.port === undefined || dto.port === null || dto.port === '' ? undefined : Number(dto.port);
    if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      throw new BadRequestException({ code: 'setup.databaseInvalid', message: '端口需要是 1-65535 之间的整数' });
    }

    const database = isNonEmptyString(dto.database) ? dto.database.trim() : undefined;
    if (!database) {
      throw new BadRequestException({ code: 'setup.databaseInvalid', message: '请填写数据库名' });
    }

    return {
      provider,
      url,
      host: isNonEmptyString(dto.host) ? dto.host.trim() : undefined,
      port,
      username: isNonEmptyString(dto.username) ? dto.username.trim() : undefined,
      // 密码不 trim：空白可能是密码的一部分
      password: typeof dto.password === 'string' && dto.password !== '' ? dto.password : undefined,
      database,
    };
  }

  /**
   * 试连一次。失败抛 `setup.databaseUnreachable`，把底层原因带在 message 里
   * （排障全靠它：是拒绝连接、认证失败、还是库不存在，用户看到的应该不一样）。
   */
  async testConnection(input: NormalizedDatabase): Promise<void> {
    if (input.provider === 'sqlite') {
      this.assertSqliteWritable(input.filePath as string);
      return;
    }

    const dataSource = new DataSource(this.optionsFor(input));
    try {
      await dataSource.initialize();
    } catch (error) {
      throw new BadRequestException({
        code: 'setup.databaseUnreachable',
        message: `连接失败：${(error as Error).message}`,
      });
    } finally {
      if (dataSource.isInitialized) await dataSource.destroy();
    }
  }

  /**
   * 把连接参数落到 `/data/db.config.json`（`0600`）。
   *
   * 写盘是"改数据库连接"唯一的持久化手段：连接参数必须能在**连库之前**读到，
   * 所以不可能存进数据库自己。容器里 /data 是唯一挂卷点，所以固定放那儿。
   */
  writeDatabaseConfig(input: NormalizedDatabase): string {
    const path = dbConfigFilePath();
    const payload =
      input.provider === 'sqlite'
        ? { provider: 'sqlite', filePath: input.filePath }
        : {
            provider: 'mysql',
            ...(input.url ? { url: input.url } : {}),
            ...(input.host ? { host: input.host } : {}),
            ...(input.port ? { port: input.port } : {}),
            ...(input.username ? { username: input.username } : {}),
            ...(input.password ? { password: input.password } : {}),
            ...(input.database ? { database: input.database } : {}),
          };

    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
      // writeFileSync 的 mode 只在"新建"时生效，文件已存在时权限不会被改
      chmodSync(path, 0o600);
    } catch (error) {
      throw new BadRequestException({
        code: 'setup.writeFailed',
        message: `写入 ${path} 失败：${(error as Error).message}`,
      });
    }

    return path;
  }

  /** SQLite 的"测试连接"不真的开库（那会顺手建出一个文件），只验证目录可写 */
  private assertSqliteWritable(filePath: string): void {
    const dir = dirname(filePath);
    const probe = `${filePath}.probe`;
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(probe, 'ok');
      unlinkSync(probe);
    } catch (error) {
      throw new BadRequestException({
        code: 'setup.databaseUnreachable',
        message: `目录不可写（${dir}）：${(error as Error).message}`,
      });
    }
  }

  /** 测试连接用的最小配置：不注册实体、不跑迁移，只验证能连上 */
  private optionsFor(input: NormalizedDatabase): DataSourceOptions {
    // 注意别把 base 标成 `as const`：那样 entities/migrations 会变成 readonly []，
    // 反而不满足 TypeORM 的可变数组类型
    const base = { entities: [], migrations: [], synchronize: false };
    return {
      ...base,
      type: 'mysql',
      host: input.host ?? '127.0.0.1',
      port: input.port ?? 3306,
      username: input.username ?? '',
      password: input.password ?? '',
      database: input.database ?? '',
      charset: 'utf8mb4',
      timezone: 'Z',
      connectTimeout: CONNECT_TIMEOUT_MS,
    } as DataSourceOptions;
  }
}
