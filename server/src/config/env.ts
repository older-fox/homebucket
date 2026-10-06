import { isAbsolute, resolve } from 'node:path';
import type { LogLevel } from '@nestjs/common';

/** 相对路径一律按 server/ 运行目录解析，方便 express 静态服务使用绝对路径 */
function absolute(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

const SIZE_UNITS: Record<string, number> = {
  b: 1,
  k: 1024,
  kb: 1024,
  m: 1024 ** 2,
  mb: 1024 ** 2,
  g: 1024 ** 3,
  gb: 1024 ** 3,
  t: 1024 ** 4,
  tb: 1024 ** 4,
};

const DEFAULT_MAX_UPLOAD_SIZE = '1gb';

/** 解析 "1024" / "10mb" / "1gb" 之类的尺寸为字节数 */
export function parseSize(value: string | undefined, fallback = DEFAULT_MAX_UPLOAD_SIZE): number {
  const match = /^(\d+(?:\.\d+)?)\s*([kmgt]?b?)?$/i.exec((value ?? fallback).trim());
  if (!match) return fallback === '1b' ? 0 : parseSize(fallback, '1b');
  const unit = (match[2] || 'b').toLowerCase();
  return Math.floor(Number(match[1]) * (SIZE_UNITS[unit] ?? 1));
}

/** Nest 的日志级别由低到高：error < warn < log < debug < verbose */
const NEST_LEVELS: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];
const LEVEL_ALIAS: Record<string, LogLevel> = { fatal: 'error', info: 'log' };

/** 把 LOG_LEVEL 展开成"该级别及以下"的级别列表，例如 info -> [error, warn, log] */
export function parseLogLevel(value: string | undefined): LogLevel[] {
  const raw = (value ?? 'info').toLowerCase().trim();
  const target =
    LEVEL_ALIAS[raw] ?? (NEST_LEVELS.includes(raw as LogLevel) ? (raw as LogLevel) : 'log');
  return NEST_LEVELS.slice(0, NEST_LEVELS.indexOf(target) + 1);
}

export type LogFormat = 'pretty' | 'json' | 'nginx';

export function parseLogFormat(value: string | undefined): LogFormat {
  const raw = (value ?? 'pretty').toLowerCase().trim();
  return raw === 'json' || raw === 'nginx' ? raw : 'pretty';
}

function parseCorsOrigin(value: string | undefined): string[] | '*' {
  const raw = (value ?? '*').trim();
  if (!raw || raw === '*') return '*';
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * 全部配置都用 getter 惰性读取 process.env：
 * 这样与 .env 的加载时机解耦（ES import 会被提升，模块顶层读取会早于 dotenv 加载）。
 */
export const env = {
  get nodeEnv(): string {
    return process.env.NODE_ENV ?? 'development';
  },
  get port(): number {
    return Number(process.env.SERVER_PORT ?? 3001);
  },
  get apiPrefix(): string {
    return process.env.API_PREFIX ?? 'api';
  },
  get corsOrigin(): string[] | '*' {
    return parseCorsOrigin(process.env.CORS_ORIGIN);
  },
  /** 请求体 / 上传文件的最大字节数（MAX_UPLOAD_SIZE，默认 1gb） */
  get maxUploadSize(): number {
    return parseSize(process.env.MAX_UPLOAD_SIZE);
  },
  get logLevels(): LogLevel[] {
    return parseLogLevel(process.env.LOG_LEVEL);
  },
  get logFormat(): LogFormat {
    return parseLogFormat(process.env.LOG_FORMAT);
  },
  get accessLog(): boolean {
    return (process.env.LOG_ACCESS ?? 'true').toLowerCase() !== 'false';
  },
  get jwtSecret(): string {
    return process.env.JWT_SECRET ?? 'homebucket-dev-secret';
  },
  get jwtExpiresIn(): string {
    return process.env.JWT_EXPIRES_IN ?? '7d';
  },
  /** 是否开放注册（POST /auth/register）；关闭后注册一律拒绝，包括凭邀请链接注册 */
  get allowRegistration(): boolean {
    return (process.env.ALLOW_REGISTRATION ?? 'true').toLowerCase() !== 'false';
  },
  get dbProvider(): 'mysql' | 'sqlite' {
    return (process.env.DB_PROVIDER ?? 'mysql').toLowerCase() === 'sqlite' ? 'sqlite' : 'mysql';
  },
  /** 启动时是否自动执行 prisma migrate deploy（默认开） */
  get autoMigrate(): boolean {
    return (process.env.AUTO_MIGRATE ?? 'true').toLowerCase() !== 'false';
  },

  // ---- 数据目录与文件存储 ----
  get dataDir(): string {
    return absolute(process.env.DATA_DIR || 'data');
  },
  get uploadDir(): string {
    const dir = process.env.UPLOAD_DIR?.trim();
    return dir ? absolute(dir) : resolve(this.dataDir, 'uploads');
  },
  get storageDriver(): 'local' | 's3' {
    return (process.env.STORAGE_DRIVER ?? 'local').toLowerCase() === 's3' ? 's3' : 'local';
  },
  get s3Endpoint(): string | undefined {
    return process.env.S3_ENDPOINT?.trim() || undefined;
  },
  get s3Region(): string {
    return process.env.S3_REGION?.trim() || 'us-east-1';
  },
  get s3Bucket(): string {
    return process.env.S3_BUCKET?.trim() || '';
  },
  get s3AccessKey(): string {
    return process.env.S3_ACCESS_KEY?.trim() || '';
  },
  get s3SecretKey(): string {
    return process.env.S3_SECRET_KEY?.trim() || '';
  },
  get s3ForcePathStyle(): boolean {
    return (process.env.S3_FORCE_PATH_STYLE ?? 'true').toLowerCase() !== 'false';
  },

  // ---- 本地化 ----
  get defaultCurrency(): string {
    return (process.env.DEFAULT_CURRENCY || 'CNY').toUpperCase();
  },
  get defaultLocale(): string {
    return process.env.DEFAULT_LOCALE || 'zh-CN';
  },
  /** 对外可访问的站点根地址，用于二维码里写完整链接；留空则二维码只写 token */
  get publicBaseUrl(): string {
    return (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  },

  // ---- 首次初始化 / 默认管理员 ----
  /** 库中还没有任何用户时，是否按下面的配置自动创建管理员 */
  get autoCreateAdmin(): boolean {
    return (process.env.AUTO_CREATE_ADMIN ?? 'true').toLowerCase() !== 'false';
  },
  get defaultAdminUsername(): string {
    return process.env.DEFAULT_ADMIN_USERNAME?.trim() || 'admin';
  },
  get defaultAdminPassword(): string {
    return process.env.DEFAULT_ADMIN_PASSWORD?.trim() || 'admin';
  },
  get defaultAdminEmail(): string {
    return process.env.DEFAULT_ADMIN_EMAIL?.trim() || 'admin@example.com';
  },

  // ---- 条码数据收集（默认开启，指向独立的收集服务）----
  get dataCollectionEnabled(): boolean {
    return (process.env.DATA_COLLECTION_ENABLED ?? 'true').toLowerCase() !== 'false';
  },
  /** 收集服务地址；为空视为未配置，跳过请求 */
  get dataCollectionEndpoint(): string {
    return (process.env.DATA_COLLECTION_ENDPOINT || '').trim().replace(/\/+$/, '');
  },
  /** 是否回传本实例填写的新条码信息 */
  get dataCollectionSubmit(): boolean {
    return (process.env.DATA_COLLECTION_SUBMIT ?? 'true').toLowerCase() !== 'false';
  },
  get dataCollectionTimeoutMs(): number {
    const value = Number(process.env.DATA_COLLECTION_TIMEOUT_MS ?? 1500);
    return Number.isFinite(value) && value > 0 ? value : 1500;
  },
};

/** 供 multer FileInterceptor 复用的上传限制（后续做文件上传接口时直接用） */
export const uploadLimits = () => ({
  fileSize: env.maxUploadSize,
  files: 20,
});
