import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

/**
 * 配置解析。能拆成纯函数的都拆开了 —— 单测直接调这些函数，不必去动 process.env。
 *
 * 两条与主仓库 server 一致的原则：
 *  1. **读不懂的值一律回退到默认值**，不静默放行成"看起来能用"的半配置状态。
 *  2. 例外是生产环境缺少管理员口令：那属于配置不完整，直接抛错拒绝启动 ——
 *     一个没有管理凭据的收集器，任何人都能改公共资料、封别人的实例。
 *
 * 迁移到 Nuxt 后的两处变化：
 *  · 相对路径按**启动时的工作目录**解析（Nitro 里没有稳定的 __dirname：
 *    dev 跑源码、生产跑 .output/server/index.mjs，两者位置不同）。
 *  · 不再有"前端产物目录"与"API 前缀"两个配置：页面由 Nuxt 自己提供，
 *    路由前缀由 server/api 的目录结构决定（/api/**）。
 */

/**
 * 开发默认管理员账号：只在非生产环境、且没配 COLLECTOR_ADMIN_USERNAME/PASSWORD 时使用。
 * 生产环境不给默认值 —— 默认口令等于没有口令（见 adminCredentialsOf）。
 */
export const DEV_ADMIN_USERNAME = 'admin';
export const DEV_ADMIN_PASSWORD = 'dev-admin-password';

/** 口令最小长度：与旧的管理令牌一致，短于这个长度宁可拒绝启动 */
export const MIN_ADMIN_PASSWORD_LENGTH = 8;

/** 账号名允许的字符：够表达 admin / ops.lisi / backup-1，又不会带进奇怪的控制字符 */
const ADMIN_USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$/;

/** v1 只实现 sqlite。MySQL/Postgres 见 README 的 roadmap */
export type DbProvider = 'sqlite';
export const DB_PROVIDERS: DbProvider[] = ['sqlite'];

/** 服务根目录 = 启动时的工作目录（含 package.json 的那一层） */
export const SERVER_ROOT = process.cwd();

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
  const [, digits = '', rawSuffix = ''] = match;
  const suffix = rawSuffix.toLowerCase();
  const unit = suffix === '' ? 1 : SIZE_UNITS[suffix];
  if (!unit) return fallback;
  const bytes = Math.round(Number.parseFloat(digits) * unit);
  return bytes > 0 ? bytes : fallback;
}

/** 存储后端：目前只认 sqlite。填别的显式报错，不要假装能跑 */
export function parseDbProvider(raw: string | undefined): DbProvider {
  const value = (raw ?? 'sqlite').trim().toLowerCase();
  if (value === 'sqlite') return 'sqlite';
  throw new Error(
    `只支持 sqlite（收到 COLLECTOR_DB_PROVIDER=${JSON.stringify(raw)}）。` +
      'Postgres/MySQL 支持见 README 的 roadmap：未实现前宁可启动失败，也不要静默降级到 SQLite。',
  );
}

/** SQLite 文件：相对路径按启动目录解析，保证换个 cwd 之外的地方不会偷偷建库 */
export function resolveDataFile(raw: string | undefined, serverRoot: string): string {
  const file = (raw ?? '').trim() || 'data/collector.db';
  return isAbsolute(file) ? file : resolve(serverRoot, file);
}

/**
 * 版本号：npm 会把 package.json 的 version 注入 npm_package_version（走 `npm start` 时永远有值）。
 * 直接用 `node .output/server/index.mjs` 启动时没有这个变量，此时读 package.json。
 */
export function packageVersion(root: string = SERVER_ROOT): string {
  const fromNpm = process.env.npm_package_version;
  if (fromNpm) return fromNpm;
  try {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export interface AdminCredential {
  username: string;
  password: string;
}

/**
 * 初始管理员凭据（.env 里的 COLLECTOR_ADMIN_USERNAME / COLLECTOR_ADMIN_PASSWORD）。
 *
 * ── 为什么生产环境必须显式配置 ──
 * 这个账号能改公共资料、封别人的实例，所以：
 *  · 生产环境没配口令 → 直接抛错拒绝启动（默认口令等于没有口令）；
 *  · 口令短于 8 字符 → 任何环境都抛错（弱口令不该因为"这是测试环境"就放行）；
 *  · 非生产环境完全没配 → 回退到固定默认值，`npm run dev` 开箱可用。
 *
 * 口令**不做 trim**：用户写进 .env 的空格也是口令的一部分，
 * 悄悄裁掉会让"我明明配了同一个密码却登不上"变成一次无解的排查。
 * 只判"是否为空"来决定要不要回退默认值。
 */
export function adminCredentialsOf(
  nodeEnv: string | undefined,
  usernameRaw: string | undefined,
  passwordRaw: string | undefined,
): AdminCredential {
  const isProduction = (nodeEnv ?? 'development').trim().toLowerCase() === 'production';

  const username = (usernameRaw ?? '').trim() || DEV_ADMIN_USERNAME;
  if (!ADMIN_USERNAME_PATTERN.test(username)) {
    throw new Error(
      `COLLECTOR_ADMIN_USERNAME 不合法（收到 ${JSON.stringify(usernameRaw)}）：` +
        '只允许 2-32 位的字母、数字、点、下划线、连字符，且以字母或数字开头',
    );
  }

  const password = passwordRaw ?? '';
  if (password === '') {
    if (isProduction) {
      throw new Error(
        `NODE_ENV=production 时必须设置 COLLECTOR_ADMIN_PASSWORD（至少 ${MIN_ADMIN_PASSWORD_LENGTH} 字符）`,
      );
    }
    return { username, password: DEV_ADMIN_PASSWORD };
  }
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error(
      `COLLECTOR_ADMIN_PASSWORD 至少 ${MIN_ADMIN_PASSWORD_LENGTH} 个字符（当前 ${password.length} 个）`,
    );
  }
  return { username, password };
}

/** 登录会话有效期（小时）：默认 7 天，允许 1 小时 ~ 1 年 */
export function sessionTtlHoursOf(raw: string | undefined): number {
  return parseIntIn(raw, 168, 1, 24 * 365);
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
  /** 版本号：走 npm script 时由 npm 注入；直接 node .output/server/index.mjs 时读 package.json */
  version: packageVersion(),
  dbProvider: parseDbProvider(process.env.COLLECTOR_DB_PROVIDER),
  dataFile: resolveDataFile(process.env.COLLECTOR_DB_FILE_PATH, SERVER_ROOT),
  autoMigrate: parseBool(process.env.COLLECTOR_AUTO_MIGRATE, true),
  /**
   * 初始管理员账号：**只在库里还没有管理员时**用来建号（见 AuthService.bootstrapAdmin）。
   * 已经有账号时这里配什么都不改库里的口令 —— 否则运维在界面上改的密码，
   * 会被下一次重启悄悄改回 .env 里的值。
   */
  admin: adminCredentialsOf(
    nodeEnv,
    process.env.COLLECTOR_ADMIN_USERNAME,
    process.env.COLLECTOR_ADMIN_PASSWORD,
  ),
  /**
   * 忘了管理员密码时的兜底：true 则启动时用 .env 里的口令强制重置已存在的账号。
   * 只该在"确实登不进去"时临时打开，重置完关掉（README 里有说明）。
   */
  adminForceReset: parseBool(process.env.COLLECTOR_ADMIN_FORCE_RESET, false),
  /** 登录会话有效期（小时） */
  sessionTtlHours: sessionTtlHoursOf(process.env.COLLECTOR_SESSION_TTL_HOURS),
  /** 登录尝试限流：默认 10 次 / 10 分钟（按来源 IP），比全局预算严得多 */
  loginRateLimit: parseIntIn(process.env.COLLECTOR_LOGIN_RATE_LIMIT, 10, 1, 1000),
  loginRateWindowMs: parseIntIn(
    process.env.COLLECTOR_LOGIN_RATE_WINDOW_MS,
    10 * 60_000,
    1000,
    24 * 3600_000,
  ),
  /** 关掉后新实例拿不到 key（老实例照常上报）—— 用于临时止血 */
  registrationOpen: parseBool(process.env.COLLECTOR_REGISTRATION_OPEN, true),
  corsOrigin: parseCorsOrigin(process.env.COLLECTOR_CORS_ORIGIN),
  /** 请求体上限（字节）：Nitro 默认 1MB，收集器的上报体很小，收到这里再压一层 */
  maxBodySize: parseSize(process.env.COLLECTOR_MAX_BODY_SIZE, 64 * 1024),
  rateLimit: parseIntIn(process.env.COLLECTOR_RATE_LIMIT, 240, 1, 100_000),
  rateWindowMs: parseIntIn(process.env.COLLECTOR_RATE_WINDOW_MS, 60_000, 1000, 3_600_000),
} as const;
