import { isAbsolute, resolve } from 'node:path';

/**
 * 配置解析。能拆成纯函数的都拆开了 —— 单测直接调这些函数，不必去动 process.env。
 *
 * 两条与 server 一致的原则：
 *  1. **读不懂的值一律回退到默认值**，不静默放行成"看起来能用"的半配置状态。
 *  2. 例外是生产环境缺少管理令牌：那属于配置不完整，直接抛错拒绝启动 ——
 *     一个没有管理令牌的收集器，任何人都能改公共资料、封别人的实例。
 */

/** 开发默认管理令牌：只在非生产环境、且没配 COLLECTOR_ADMIN_TOKEN 时使用 */
export const DEV_ADMIN_TOKEN = 'dev-admin-token';

/** v1 只实现 sqlite。MySQL/Postgres 见 README 的 roadmap */
export type DbProvider = 'sqlite';
export const DB_PROVIDERS: DbProvider[] = ['sqlite'];

/**
 * 服务根目录（含 src/、package.json 的那一层）。
 * 从 __dirname 往上两级对 src/config 与 dist/config 都成立，
 * 因此不依赖启动时的工作目录 —— 从任何 cwd 启动都能找到数据目录与前端产物。
 */
export const SERVER_ROOT = resolve(__dirname, '..', '..');

const TRUTHY = ['1', 'true', 'yes', 'on'];
const FALSY = ['0', 'false', 'no', 'off'];

/** 只有显式写了 false 一类的词才算关；空值/读不懂都按默认值 */
export function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const value = raw.trim().toLowerCase();
  if (value === '') return fallback;
  if (TRUTHY.includes(value)) return true;
  if (FALSY.includes(value)) return false;
  return fallback;
}

/** 整数解析 + 范围钳制：非数字、越界一律回退 */
export function parseIntIn(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === undefined) return fallback;
  const text = raw.trim();
  // 必须是纯整数字面量：'12.5' 这种宁可回退默认值，也不要静默截断成 12
  if (!/^[+-]?\d+$/.test(text)) return fallback;
  const value = Number.parseInt(text, 10);
  if (!Number.isFinite(value) || Number.isNaN(value)) return fallback;
  if (value < min || value > max) return fallback;
  return value;
}

const SIZE_UNITS: Record<string, number> = {
  b: 1,
  k: 1024,
  kb: 1024,
  m: 1024 * 1024,
  mb: 1024 * 1024,
  g: 1024 * 1024 * 1024,
  gb: 1024 * 1024 * 1024,
};

/** 体积解析："64kb" / "1mb" / "1024" → 字节数；读不懂就回退 */
export function parseSize(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const match = /^\s*(\d+(?:\.\d+)?)\s*([a-z]*)\s*$/i.exec(raw);
  if (!match) return fallback;
  // 没写单位按字节算（"2048" 就是 2048 字节），写了单位必须是认识的
  const suffix = match[2].toLowerCase();
  const unit = suffix === '' ? 1 : SIZE_UNITS[suffix];
  if (!unit) return fallback;
  const bytes = Math.round(Number.parseFloat(match[1]) * unit);
  return bytes > 0 ? bytes : fallback;
}

/** 存储后端：目前只认 sqlite。填别的显式报错，不要假装能跑 */
export function parseDbProvider(raw: string | undefined): DbProvider {
  const value = (raw ?? 'sqlite').trim().toLowerCase();
  if (value === 'sqlite') return 'sqlite';
  throw new Error(
    `COLLECTOR_DB_FILE_PATH 之外只支持 sqlite（收到 COLLECTOR_DB_PROVIDER=${JSON.stringify(raw)}）。` +
      'Postgres/MySQL 支持见 README 的 roadmap：未实现前宁可启动失败，也不要静默降级到 SQLite。',
  );
}

/** SQLite 文件：相对路径按服务根目录解析，保证换 cwd 也不会把库建到别处 */
export function resolveDataFile(raw: string | undefined, serverRoot: string): string {
  const file = (raw ?? '').trim() || 'data/collector.db';
  return isAbsolute(file) ? file : resolve(serverRoot, file);
}

/** 前端静态产物目录：相对路径按服务根目录解析；不存在时启动只是不打前端（API 仍可用） */
export function resolveWebDir(raw: string | undefined, serverRoot: string): string {
  const dir = (raw ?? '').trim() || '../web/dist';
  return isAbsolute(dir) ? dir : resolve(serverRoot, dir);
}

/** 管理令牌：生产必须显式配置（≥8 字符），开发回退到固定默认值 */
export function adminTokenOf(nodeEnv: string | undefined, raw: string | undefined): string {
  const token = (raw ?? '').trim();
  if (token.length >= 8) return token;
  if ((nodeEnv ?? 'development').trim().toLowerCase() === 'production') {
    throw new Error('NODE_ENV=production 时必须设置 COLLECTOR_ADMIN_TOKEN（至少 8 字符）');
  }
  return DEV_ADMIN_TOKEN;
}

/** CORS：`*` 或逗号分隔的来源列表（公开只读接口默认允许任何站点跨域调用） */
export function parseCorsOrigin(raw: string | undefined): string | string[] {
  const value = (raw ?? '').trim();
  if (value === '' || value === '*') return '*';
  const list = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return list.length === 0 ? '*' : list;
}

const nodeEnv = process.env.NODE_ENV?.trim() || 'development';

export const env = {
  nodeEnv,
  isProduction: nodeEnv.toLowerCase() === 'production',
  serverRoot: SERVER_ROOT,
  port: parseIntIn(process.env.COLLECTOR_PORT, 3400, 1, 65535),
  host: process.env.COLLECTOR_HOST?.trim() || '0.0.0.0',
  apiPrefix: process.env.COLLECTOR_API_PREFIX?.trim().replace(/^\/+|\/+$/g, '') || 'api',
  /** 版本号：走 npm script 时由 npm 注入；直接 node dist/main.js 时回退 */
  version: process.env.npm_package_version ?? '0.0.1',
  dbProvider: parseDbProvider(process.env.COLLECTOR_DB_PROVIDER),
  dataFile: resolveDataFile(process.env.COLLECTOR_DB_FILE_PATH, SERVER_ROOT),
  autoMigrate: parseBool(process.env.COLLECTOR_AUTO_MIGRATE, true),
  adminToken: adminTokenOf(nodeEnv, process.env.COLLECTOR_ADMIN_TOKEN),
  /** 关掉后新实例拿不到 key（老实例照常上报）—— 用于临时止血 */
  registrationOpen: parseBool(process.env.COLLECTOR_REGISTRATION_OPEN, true),
  webDir: resolveWebDir(process.env.COLLECTOR_WEB_DIR, SERVER_ROOT),
  corsOrigin: parseCorsOrigin(process.env.COLLECTOR_CORS_ORIGIN),
  /** Fastify 的 bodyLimit 只认字节数 */
  maxBodySize: parseSize(process.env.COLLECTOR_MAX_BODY_SIZE, 64 * 1024),
  rateLimit: parseIntIn(process.env.COLLECTOR_RATE_LIMIT, 240, 1, 100_000),
  rateWindowMs: parseIntIn(process.env.COLLECTOR_RATE_WINDOW_MS, 60_000, 1000, 3_600_000),
} as const;
