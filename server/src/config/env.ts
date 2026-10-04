import type { LogLevel } from '@nestjs/common';

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
  get dbProvider(): 'mysql' | 'sqlite' {
    return (process.env.DB_PROVIDER ?? 'mysql').toLowerCase() === 'sqlite' ? 'sqlite' : 'mysql';
  },
  /** 启动时是否自动执行 prisma migrate deploy（默认开） */
  get autoMigrate(): boolean {
    return (process.env.AUTO_MIGRATE ?? 'true').toLowerCase() !== 'false';
  },
};

/** 供 multer FileInterceptor 复用的上传限制（后续做文件上传接口时直接用） */
export const uploadLimits = () => ({
  fileSize: env.maxUploadSize,
  files: 20,
});
