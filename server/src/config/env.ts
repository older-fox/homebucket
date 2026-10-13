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

/** 尺寸字面量是否合法（与 parseSize 的文法一致）——设置接口校验用，parseSize 本身会静默兜底 */
export function isValidSizeLiteral(value: string): boolean {
  return /^(\d+(?:\.\d+)?)\s*([kmgt]?b?)?$/i.test(value.trim());
}

/** Nest 的日志级别由低到高：error < warn < log < debug < verbose */
const NEST_LEVELS: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];
const LEVEL_ALIAS: Record<string, LogLevel> = { fatal: 'error', info: 'log' };

/** 把 LOG_LEVEL 展开成"该级别及以下"的级别列表，例如 info -> [error, warn, log] */
export function parseLogLevel(value: string | undefined): LogLevel[] {
  const text = (value ?? 'info').toLowerCase().trim();
  const target =
    LEVEL_ALIAS[text] ?? (NEST_LEVELS.includes(text as LogLevel) ? (text as LogLevel) : 'log');
  return NEST_LEVELS.slice(0, NEST_LEVELS.indexOf(target) + 1);
}

export type LogFormat = 'pretty' | 'json' | 'nginx';

export function parseLogFormat(value: string | undefined): LogFormat {
  const text = (value ?? 'pretty').toLowerCase().trim();
  return text === 'json' || text === 'nginx' ? text : 'pretty';
}

function parseCorsOrigin(value: string | undefined): string[] | '*' {
  const text = (value ?? '*').trim();
  if (!text || text === '*') return '*';
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * ── 数据库覆盖层 ──
 *
 * 「设置 → 实例设置」把值写在 `AppSetting` 表里，启动时（以及每次保存后）灌进下面这个
 * Map，于是同一套 getter 有了三级来源：
 *
 *     数据库覆盖  >  process.env（.env 由 dotenv 读进来）  >  各 getter 里的 `??` 默认值
 *
 * 为什么不直接把值写回 `process.env.X`：
 *   1. `process.env` 是进程级全局，写进去以后任何 `process.env.X` 读取（含第三方库、
 *      Nest 内部）都会被影响，出了偏差极难定位是哪一层给的；
 *   2. 写回去就再也分不清"这个值是用户配的还是 .env 带的"，而"已保存但需重启才生效"
 *      这个提示恰恰依赖两者可区分（见 isPendingRestart）。
 *
 * 为什么这段逻辑就在本文件、而不是单独一个 config/overrides.ts：
 * `test/env.test.mjs` 会用 Node 的 ESM 直接 import 本文件（`import ... from '../src/config/env.ts'`），
 * 而 Node 的 ESM 解析要求相对导入写全扩展名；本仓库 `module: commonjs` 且没有开
 * allowImportingTsExtensions，写 `./overrides.ts` 编译不过。放在这里还顺带更内聚 ——
 * "配置怎么取值"本来就是本文件的事。
 */
const overrides = new Map<string, string>();
/** 本次进程**启动时**各配置的实际生效值，用来判断"改了但还没生效" */
let bootEffective = new Map<string, string | undefined>();
let bootSnapshotTaken = false;

/** 所有配置的唯一读取口：数据库覆盖优先，其次 process.env（含 dotenv 读进来的 .env） */
export function raw(name: string): string | undefined {
  return overrides.has(name) ? overrides.get(name) : process.env[name];
}

/** 该项是否被数据库覆盖（界面据此显示"这份值来自哪里"） */
export function hasOverride(name: string): boolean {
  return overrides.has(name);
}

/**
 * 用数据库里的全量设置重建覆盖层。
 *
 * 整体替换而不是逐项增删：调用方每次都是把 `AppSetting` 整表读出来，
 * 少一个"删除某项"的分支就少一处不一致的机会。
 */
export function setOverrides(values: Record<string, string>): void {
  overrides.clear();
  for (const [name, value] of Object.entries(values)) overrides.set(name, value);
}

/** 清空覆盖层（测试用；生产路径不会整体清空，只会被 setOverrides 重建） */
export function clearOverrides(): void {
  overrides.clear();
}

/**
 * 记下本次进程启动时各配置的实际生效值。
 *
 * 必须在读取任何配置**之前**调用 —— 也就是 main.ts 里刚 setOverrides() 完之后。
 */
export function snapshotBootValues(names: readonly string[]): void {
  bootEffective = new Map(names.map((name) => [name, raw(name)]));
  bootSnapshotTaken = true;
}

/**
 * 该项是否「已保存，但本进程还没用上」。
 *
 * 只对**启动期读取**的项有意义（调用方先判 restartRequired）：运行期读取的项保存后
 * 下一个请求就是新值，永远不会进这个分支。判断依据是"现在的有效值"与"进程启动时的
 * 有效值"不同 —— 重启之后快照取的就是新值，徽标自动消失。
 */
export function isPendingRestart(name: string): boolean {
  if (!bootSnapshotTaken) return false;
  return bootEffective.has(name) && bootEffective.get(name) !== raw(name);
}

/**
 * 全部配置都用 getter 惰性读取：
 *   · 与 .env 的加载时机解耦（ES import 会被提升，模块顶层读取会早于 dotenv 加载）；
 *   · 读取口是 `raw()`，它按「数据库覆盖 > process.env（.env）> 下面各 getter 的 `??` 默认值」
 *     取第一层有的值 —— 所以数据库里的设置天然对**所有**调用点生效，不必逐个改造消费方。
 *
 * 例外：数据库连接参数与 AUTO_MIGRATE 直接读 process.env（见文件末尾那段），
 * 它们必须在库可读之前就确定，不可能由库里的配置来覆盖。
 */
export const env = {
  get nodeEnv(): string {
    return raw('NODE_ENV') ?? 'development';
  },
  get port(): number {
    return Number(raw('SERVER_PORT') ?? 3001);
  },
  get apiPrefix(): string {
    return raw('API_PREFIX') ?? 'api';
  },
  get corsOrigin(): string[] | '*' {
    return parseCorsOrigin(raw('CORS_ORIGIN'));
  },
  /** 请求体 / 上传文件的最大字节数（MAX_UPLOAD_SIZE，默认 1gb） */
  get maxUploadSize(): number {
    return parseSize(raw('MAX_UPLOAD_SIZE'));
  },
  get logLevels(): LogLevel[] {
    return parseLogLevel(raw('LOG_LEVEL'));
  },
  get logFormat(): LogFormat {
    return parseLogFormat(raw('LOG_FORMAT'));
  },
  get accessLog(): boolean {
    return (raw('LOG_ACCESS') ?? 'true').toLowerCase() !== 'false';
  },
  get jwtSecret(): string {
    return raw('JWT_SECRET') ?? 'homebucket-dev-secret';
  },
  get jwtExpiresIn(): string {
    return raw('JWT_EXPIRES_IN') ?? '7d';
  },
  /** 是否开放注册（POST /auth/register）；关闭后注册一律拒绝，包括凭邀请链接注册 */
  get allowRegistration(): boolean {
    return (raw('ALLOW_REGISTRATION') ?? 'true').toLowerCase() !== 'false';
  },

  // ---- 数据库连接（不参与数据库覆盖，只能来自 .env）----
  /**
   * MySQL 连接参数。仍然以 `DATABASE_URL` 为准（沿用 Prisma 时代的格式，
   * 这样已有部署的 .env 不用改），格式：mysql://user:pass@host:3306/dbname。
   * 另外允许用 DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME 单独覆盖。
   *
   * 直接读 `process.env` 而**不走 `raw()`**：要连上库才能读到库里的配置，
   * 用库里的配置去配数据库是循环依赖。
   */
  get mysqlConnection(): {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  } {
    const url = (process.env.DATABASE_URL ?? '').trim();
    let parsed: URL | null = null;
    if (url) {
      try {
        parsed = new URL(url);
      } catch {
        console.warn('[env] DATABASE_URL 格式不合法，将只使用 DB_* 变量');
      }
    }
    const database = process.env.DB_NAME?.trim() || parsed?.pathname.replace(/^\//, '') || '';
    return {
      host: process.env.DB_HOST?.trim() || parsed?.hostname || '127.0.0.1',
      port: Number(process.env.DB_PORT ?? parsed?.port ?? 3306),
      username: process.env.DB_USER?.trim() || (parsed ? decodeURIComponent(parsed.username) : ''),
      password: process.env.DB_PASSWORD ?? (parsed ? decodeURIComponent(parsed.password) : ''),
      database,
    };
  },
  /** 同上：连接参数之一，直接读 process.env */
  get dbProvider(): 'mysql' | 'sqlite' {
    return (process.env.DB_PROVIDER ?? 'mysql').toLowerCase() === 'sqlite' ? 'sqlite' : 'mysql';
  },
  /** 同上：它决定"启动时要不要跑迁移"，而迁移正是建出 AppSetting 表的那一步，也是循环 */
  get autoMigrate(): boolean {
    return (process.env.AUTO_MIGRATE ?? 'true').toLowerCase() !== 'false';
  },
  /**
   * SQLite 数据库文件绝对路径。
   * 兼容 Prisma 时代的 `file:./data/homebucket.db` 写法：剥掉 `file:` 前缀，
   * 相对路径按 server/ 运行目录解析（与 DATA_DIR 的规则一致）。
   */
  get sqliteFile(): string {
    const value = (process.env.DB_FILE_PATH ?? './data/homebucket.db').trim();
    return absolute(value.replace(/^file:/i, ''));
  },

  // ---- 数据目录与文件存储 ----
  get dataDir(): string {
    return absolute(raw('DATA_DIR') || 'data');
  },
  get uploadDir(): string {
    const dir = raw('UPLOAD_DIR')?.trim();
    return dir ? absolute(dir) : resolve(this.dataDir, 'uploads');
  },
  get storageDriver(): 'local' | 's3' {
    return (raw('STORAGE_DRIVER') ?? 'local').toLowerCase() === 's3' ? 's3' : 'local';
  },
  get s3Endpoint(): string | undefined {
    return raw('S3_ENDPOINT')?.trim() || undefined;
  },
  get s3Region(): string {
    return raw('S3_REGION')?.trim() || 'us-east-1';
  },
  get s3Bucket(): string {
    return raw('S3_BUCKET')?.trim() || '';
  },
  get s3AccessKey(): string {
    return raw('S3_ACCESS_KEY')?.trim() || '';
  },
  get s3SecretKey(): string {
    return raw('S3_SECRET_KEY')?.trim() || '';
  },
  get s3ForcePathStyle(): boolean {
    return (raw('S3_FORCE_PATH_STYLE') ?? 'true').toLowerCase() !== 'false';
  },

  // ---- 本地化 ----
  get defaultCurrency(): string {
    return (raw('DEFAULT_CURRENCY') || 'CNY').toUpperCase();
  },
  get defaultLocale(): string {
    return raw('DEFAULT_LOCALE') || 'zh-CN';
  },
  /** 对外可访问的站点根地址，用于二维码里写完整链接；留空则二维码只写 token */
  get publicBaseUrl(): string {
    return (raw('PUBLIC_BASE_URL') || '').replace(/\/+$/, '');
  },

  // ---- 首次初始化 / 默认管理员 ----
  /** 库中还没有任何用户时，是否按下面的配置自动创建管理员 */
  get autoCreateAdmin(): boolean {
    return (raw('AUTO_CREATE_ADMIN') ?? 'true').toLowerCase() !== 'false';
  },
  get defaultAdminUsername(): string {
    return raw('DEFAULT_ADMIN_USERNAME')?.trim() || 'admin';
  },
  get defaultAdminPassword(): string {
    return raw('DEFAULT_ADMIN_PASSWORD')?.trim() || 'admin';
  },
  get defaultAdminEmail(): string {
    return raw('DEFAULT_ADMIN_EMAIL')?.trim() || 'admin@example.com';
  },

  // ---- 条码数据收集（默认开启，指向独立的收集服务）----
  get dataCollectionEnabled(): boolean {
    return (raw('DATA_COLLECTION_ENABLED') ?? 'true').toLowerCase() !== 'false';
  },
  /** 收集服务地址；为空视为未配置，跳过请求 */
  get dataCollectionEndpoint(): string {
    return (raw('DATA_COLLECTION_ENDPOINT') || '').trim().replace(/\/+$/, '');
  },
  /** 是否回传本实例填写的新条码信息 */
  get dataCollectionSubmit(): boolean {
    return (raw('DATA_COLLECTION_SUBMIT') ?? 'true').toLowerCase() !== 'false';
  },
  get dataCollectionTimeoutMs(): number {
    const value = Number(raw('DATA_COLLECTION_TIMEOUT_MS') ?? 1500);
    return Number.isFinite(value) && value > 0 ? value : 1500;
  },

  // ---- 定时全量上报（收集器 v1 实例协议，见 collection/collection-sync.service.ts）----
  /** 是否启用"定时上报所有带条码的物品" */
  get dataCollectionSyncEnabled(): boolean {
    return (raw('DATA_COLLECTION_SYNC_ENABLED') ?? 'true').toLowerCase() !== 'false';
  },
  /**
   * 定时表达式，**6 段（含秒）**：@nestjs/schedule 用的是 cron v4，写 5 段会启动报错。
   * 默认每天 03:00。改动由 `CollectionSyncService.reregister()` 热更，不需要重启。
   */
  get dataCollectionSyncCron(): string {
    return (raw('DATA_COLLECTION_SYNC_CRON') || '0 0 3 * * *').trim();
  },
  /** 单轮最多上报多少个物品（超过就留到下一轮，避免一次性打满收集器的限流预算） */
  get dataCollectionSyncMaxItems(): number {
    const value = Number(raw('DATA_COLLECTION_SYNC_MAX_ITEMS') ?? 500);
    return Number.isFinite(value) && value >= 1 ? Math.trunc(value) : 500;
  },
  /** 两次请求之间的最小间隔（毫秒）：收集器默认 240 次/分钟，250ms 刚好留了余量 */
  get dataCollectionSyncThrottleMs(): number {
    const value = Number(raw('DATA_COLLECTION_SYNC_THROTTLE_MS') ?? 250);
    return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 250;
  },
  /** 连续失败多少次后中止本轮（断路器：别对着一个死地址空转一整轮） */
  get dataCollectionSyncMaxFailures(): number {
    const value = Number(raw('DATA_COLLECTION_SYNC_MAX_FAILURES') ?? 5);
    return Number.isFinite(value) && value >= 1 ? Math.trunc(value) : 5;
  },
  /** 单张照片上传的超时（毫秒）：比文字上报长得多，8MB 的图不是一个量级 */
  get dataCollectionPhotoTimeoutMs(): number {
    const value = Number(raw('DATA_COLLECTION_PHOTO_TIMEOUT_MS') ?? 15000);
    return Number.isFinite(value) && value >= 1000 ? Math.trunc(value) : 15000;
  },
  /** 单张照片的字节上限；必须与收集器的 COLLECTOR_PHOTO_MAX_BYTES 对齐（默认 8MB） */
  get dataCollectionPhotoMaxBytes(): number {
    const value = Number(raw('DATA_COLLECTION_PHOTO_MAX_BYTES') ?? 8 * 1024 * 1024);
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 8 * 1024 * 1024;
  },
  /** 每个物品最多上传几张；必须与收集器的 MAX_IMAGE_URLS(12) 对齐 */
  get dataCollectionPhotoMaxPerItem(): number {
    const value = Number(raw('DATA_COLLECTION_PHOTO_MAX_PER_ITEM') ?? 12);
    return Number.isFinite(value) && value >= 1 ? Math.min(Math.trunc(value), 12) : 12;
  },
};

/** 供 multer FileInterceptor 复用的上传限制（后续做文件上传接口时直接用） */
export const uploadLimits = () => ({
  fileSize: env.maxUploadSize,
  files: 20,
});
