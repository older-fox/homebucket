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

/**
 * 照片存储后端。
 *
 * `local` 把图片字节落在本地磁盘（默认 `data/photos/`），经 `GET /api/photos/**` 供图；
 * `s3` 走 S3 兼容对象存储（MinIO、Ceph、AWS S3 都行）。
 *
 * ── 为什么填 s3 却缺配置时直接抛错，而不是悄悄回退到 local ──
 * 回退的后果是"配置写错了但服务能起来"：数据落在本地容器里，运维以为在 S3 上，
 * 容器一重建图片全丢。宁可启动失败，也不要这种静默降级 —— 和 COLLECTOR_DB_PROVIDER 一个原则。
 */
export type PhotoDriver = 'local' | 's3';
export const PHOTO_DRIVERS: PhotoDriver[] = ['local', 's3'];

/**
 * 出站同步（把收集到的数据交给"上级数据库"）的传输方式。
 *
 * ── 方向说明 ──
 * 收集器对外是**被动**的：它既提供只读导出给对方来拉，也能接收对方推回来的数据。
 * 但"上级数据库"本身是另一个项目、接口尚未确定，所以这里做的是**适配层**：
 * 传输方式由配置决定，载荷形状与业务逻辑与传输解耦。换传输只改配置，不动业务代码。
 *
 * `off`      —— 默认。不启用出站同步（连页面上的"立即同步"也会拒绝）。
 * `http`     —— 向 `COLLECTOR_SYNC_ENDPOINT` 发 JSON（见 sync.service 的载荷说明）。
 * `file`     —— 把载荷写成文件落到 `COLLECTOR_SYNC_DIR`，交给对方自行取走。
 */
export type SyncTransport = 'off' | 'http' | 'file';
export const SYNC_TRANSPORTS: SyncTransport[] = ['off', 'http', 'file'];

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
 * 本地照片目录：默认 `<库文件所在目录>/photos`。
 *
 * 刻意跟着数据库文件走，而不是各自独立默认：备份时"把 data/ 拷走"就能同时拿到
 * 库和图片，不会出现"库备份了、图没了"。显式配置则完全按配置来（可以是挂载卷）。
 */
export function photoLocalDirOf(raw: string | undefined, serverRoot: string): string {
  const dir = (raw ?? '').trim();
  if (dir !== '') return isAbsolute(dir) ? dir : resolve(serverRoot, dir);
  return resolveServerPath(dirnameOfFile(resolveDataFile(undefined, serverRoot)), 'photos');
}

/** 出站同步（transport=file）落盘目录：默认 `data/sync/` */
export function syncDirOf(raw: string | undefined, serverRoot: string): string {
  const dir = (raw ?? '').trim();
  if (dir !== '') return isAbsolute(dir) ? dir : resolve(serverRoot, dir);
  return resolveServerPath(dirnameOfFile(resolveDataFile(undefined, serverRoot)), 'sync');
}

function dirnameOfFile(file: string): string {
  const cut = file.lastIndexOf('/');
  return cut <= 0 ? file : file.slice(0, cut);
}

function resolveServerPath(dir: string, name: string): string {
  return dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`;
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

/** 照片存储后端解析：读不懂一律抛错，不静默降级（理由见 PhotoDriver） */
export function parsePhotoDriver(raw: string | undefined): PhotoDriver {
  const value = (raw ?? 'local').trim().toLowerCase();
  if (value === 'local' || value === 's3') return value;
  throw new Error(
    `COLLECTOR_PHOTO_DRIVER 只支持 local / s3（收到 ${JSON.stringify(raw)}）。` +
      '写错时宁可启动失败，也不要静默把照片落到本地磁盘。',
  );
}

/** 出站同步传输方式解析：读不懂一律抛错（写错 transport 会变成"同步看着开了却没发出去"） */
export function parseSyncTransport(raw: string | undefined): SyncTransport {
  const value = (raw ?? 'off').trim().toLowerCase();
  if (value === 'off' || value === 'http' || value === 'file') return value;
  throw new Error(
    `COLLECTOR_SYNC_TRANSPORT 只支持 off / http / file（收到 ${JSON.stringify(raw)}）`,
  );
}

/**
 * 照片存储配置完整性：driver=s3 时必须把连接信息配全。
 *
 * 单独抽出成"启动时调用一次"的函数（而不是在 env 常量里抛），
 * 是为了让**单测能分别构造这两种驱动**、也让报错时机集中在启动日志里一处。
 * 报错信息里逐项列出缺了什么 —— "缺 3 个环境变量"比"配置错误"能省半小时。
 */
export function assertPhotoConfig(config: {
  driver: PhotoDriver;
  s3: { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string };
}): void {
  if (config.driver !== 's3') return;
  const missing: string[] = [];
  if (config.s3.endpoint === '') missing.push('COLLECTOR_S3_ENDPOINT');
  if (config.s3.bucket === '') missing.push('COLLECTOR_S3_BUCKET');
  if (config.s3.accessKeyId === '') missing.push('COLLECTOR_S3_ACCESS_KEY_ID');
  if (config.s3.secretAccessKey === '') missing.push('COLLECTOR_S3_SECRET_ACCESS_KEY');
  if (missing.length > 0) {
    throw new Error(
      `COLLECTOR_PHOTO_DRIVER=s3 但缺少配置：${missing.join('、')}。` +
        '不配全就启动会让人以为照片存进了对象存储，实际一张也存不下。',
    );
  }
}

/**
 * 出站同步配置完整性：transport=http/file 时目标必须给出。
 * 与 assertPhotoConfig 同一原则 —— 半配置状态宁可启动失败。
 */
export function assertSyncConfig(config: {
  transport: SyncTransport;
  endpoint: string;
  dir: string;
}): void {
  if (config.transport === 'http' && config.endpoint === '') {
    throw new Error(
      'COLLECTOR_SYNC_TRANSPORT=http 但没配 COLLECTOR_SYNC_ENDPOINT（往哪儿发？）',
    );
  }
  if (config.transport === 'file' && config.dir === '') {
    throw new Error('COLLECTOR_SYNC_TRANSPORT=file 但没配 COLLECTOR_SYNC_DIR（写到哪个目录？）');
  }
}

/**
 * 反馈权重：由"用户是否认为这条资料准确"累积出来的实例可信度乘数。
 *
 * ── 为什么权重存在实例维度而不是"某条上报"维度 ──
 * 用户反馈的是**下发出去的那条资料准不准**，而下发值来自某个实例的上报。
 * 但单条上报是会过期的（同一个实例后来报了更正的值），而"这个实例靠不靠谱"
 * 是跨物品、跨时间累积的判断。所以权重落在实例上，参与该实例所有上报的投票。
 *
 * 正反馈乘 `up`、负反馈除 `down`（乘 1/down），并夹在 [min, max] 之间防止
 * "一个实例凭 3 条好反馈压死所有人"或"一次误报就被永久封杀"。
 */
export interface FeedbackWeights {
  /** 初始权重（新实例，还没有任何反馈） */
  initial: number;
  /** 正反馈乘数（>1） */
  up: number;
  /** 负反馈除数（>1，按 1/down 衰减） */
  down: number;
  min: number;
  max: number;
}

/**
 * 权重乘数解析：必须是有限正数，否则回退。
 * 用 1000 倍整数比较避免浮点误差（0.1 这种十进制小数在二进制里存不准）。
 */
function parseMultiplier(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const text = raw.trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return fallback;
  const value = Number.parseFloat(text);
  // 乘数必须 >1 才有"加权"的意义：等于 1 是没配、小于 1 是反向，都按没配处理
  if (!Number.isFinite(value) || value <= 1) return fallback;
  return value;
}

export function feedbackWeightsOf(source: {
  initial?: string;
  up?: string;
  down?: string;
  min?: string;
  max?: string;
}): FeedbackWeights {
  const initial = parseMultiplier(source.initial, 1);
  const max = parseMultiplier(source.max, 5);
  const min = parseMultiplier(source.min, 0.05);
  const up = parseMultiplier(source.up, 1.2);
  const down = parseMultiplier(source.down, 1.5);
  return {
    // initial 允许为 1（新实例的"中性"权重），所以不走 parseMultiplier 的 >1 约束
    initial: Number.isFinite(initial) ? initial : 1,
    up,
    down,
    // 下界必须小于上界，否则夹取结果取决于调用顺序（不可复现）
    min: min < max ? min : 0.05,
    max,
  };
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

/**
 * 照片存储配置。单独成函数是为了"构建 → 校验 → 返回"三步能一眼看全：
 * driver=s3 时配置缺项会在这里抛错（assertPhotoConfig），而不是等到第一张图上传说找不到桶。
 */
function photoConfig() {
  const driver = parsePhotoDriver(process.env.COLLECTOR_PHOTO_DRIVER);
  const s3 = {
    endpoint: (process.env.COLLECTOR_S3_ENDPOINT ?? '').trim(),
    region: (process.env.COLLECTOR_S3_REGION ?? 'us-east-1').trim() || 'us-east-1',
    bucket: (process.env.COLLECTOR_S3_BUCKET ?? '').trim(),
    accessKeyId: (process.env.COLLECTOR_S3_ACCESS_KEY_ID ?? '').trim(),
    secretAccessKey: process.env.COLLECTOR_S3_SECRET_ACCESS_KEY ?? '',
    /** 对象键前缀，便于同一个桶里分目录放（默认 `photos/`） */
    prefix: (process.env.COLLECTOR_S3_PREFIX ?? 'photos/').trim(),
    /** MinIO/Ceph 这类自建服务通常必须开 path-style，AWS 关掉即可 */
    forcePathStyle: parseBool(process.env.COLLECTOR_S3_FORCE_PATH_STYLE, true),
    /** 对外访问地址（CDN / 公开桶域名）；留空则走本站的 /api/photos 反向代理 */
    publicBase: (process.env.COLLECTOR_S3_PUBLIC_BASE ?? '').trim().replace(/\/+$/, ''),
  };
  assertPhotoConfig({ driver, s3 });

  return {
    driver,
    /**
     * local 驱动的落盘根目录。
     * 默认跟着数据库文件所在目录走（`<库目录>/photos`），这样"备份一个目录"就能同时
     * 备份库和图片；显式配了 COLLECTOR_PHOTO_LOCAL_DIR 就按配置来。
     */
    localDir: photoLocalDirOf(process.env.COLLECTOR_PHOTO_LOCAL_DIR, SERVER_ROOT),
    /**
     * 对外访问前缀：拼在 `/api/photos/<hash>.<ext>` 前面的绝对地址。
     * 只有部署在反代 / CDN 后面、或要让外部系统直接抓到图时才需要配；
     * 留空就用相对路径（浏览器同源访问没问题，对方系统需要自己补 base）。
     */
    publicBase: (process.env.COLLECTOR_PHOTO_PUBLIC_BASE ?? '').trim().replace(/\/+$/, ''),
    /** 单张照片大小上限：默认 8MB（手机直出的大图够用，又不至于把磁盘写满） */
    maxBytes: parseSize(process.env.COLLECTOR_PHOTO_MAX_BYTES, 8 * 1024 * 1024),
    /** 照片总数上限（0 = 不限）：磁盘保护，超出后拒绝新上传，老图不受影响 */
    maxFiles: parseIntIn(process.env.COLLECTOR_PHOTO_MAX_FILES, 20_000, 0, 10_000_000),
    /**
     * 是否允许匿名上传。默认允许（收集器本来就有匿名的老客户端上报通道），
     * 但匿名上传受全局 IP 限流约束；要完全关掉就把这项设为 false。
     */
    allowAnonymousUpload: parseBool(process.env.COLLECTOR_PHOTO_ALLOW_ANONYMOUS, true),
    /**
     * 是否拒收仍带元数据的照片（EXIF/GPS/相机参数/XMP）。
     *
     * 收集器公开承诺不收"存放位置"，而一张照片的 EXIF 里可能正带着 GPS ——
     * 上报端负责先剥离，这里负责拒收残留（剥离器失效时拒收就是警报）。
     * 留这个开关是因为万一某种格式在现网误判，运维能一次重启放开，
     * 而不是等一个发版。
     */
    rejectExif: parseBool(process.env.COLLECTOR_PHOTO_REJECT_EXIF, true),
    s3,
  };
}

/**
 * 出站同步配置。"上级数据库"是外部项目、接口未定，所以这里只有传输参数；
 * 往对方送什么内容由 sync.service 的载荷构造决定（与传输解耦）。
 */
function syncConfig() {
  const transport = parseSyncTransport(process.env.COLLECTOR_SYNC_TRANSPORT);
  const endpoint = (process.env.COLLECTOR_SYNC_ENDPOINT ?? '').trim();
  const dir = syncDirOf(process.env.COLLECTOR_SYNC_DIR, SERVER_ROOT);
  assertSyncConfig({ transport, endpoint, dir });

  return {
    transport,
    /** transport=http 时的目标地址（POST JSON） */
    endpoint,
    /** transport=http 时的 Bearer 令牌（对方要求鉴权时用） */
    token: (process.env.COLLECTOR_SYNC_TOKEN ?? '').trim(),
    /** transport=file 时的落盘目录 */
    dir,
    /** 自动同步周期（分钟）：0 = 只手动触发，不跑定时器 */
    intervalMinutes: parseIntIn(process.env.COLLECTOR_SYNC_INTERVAL_MINUTES, 0, 0, 10_080),
    /** 单次发送的条目上限（分页发送，避免一次几万条把对方打挂） */
    batchSize: parseIntIn(process.env.COLLECTOR_SYNC_BATCH_SIZE, 200, 1, 5000),
    /** 单次请求超时（毫秒） */
    timeoutMs: parseIntIn(process.env.COLLECTOR_SYNC_TIMEOUT_MS, 10_000, 500, 300_000),
    /** 失败后的最大重试次数（超过就标 failed，等下次手动或定时再试） */
    maxAttempts: parseIntIn(process.env.COLLECTOR_SYNC_MAX_ATTEMPTS, 5, 1, 100),
    /**
     * 是否把照片一并列出。图片以本站可访问的绝对 URL 形式给出（对方自己抓），
     * 不内联字节 —— 内联会让载荷体积 ×1.33，图库一大就不适合走 JSON。
     */
    includePhotos: parseBool(process.env.COLLECTOR_SYNC_INCLUDE_PHOTOS, true),
  };
}

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

  /**
   * ── 照片存储 ──
   * 实例上报的图片字节存哪里、对外怎么访问。详见 server/storage/。
   */
  photo: photoConfig(),

  /**
   * ── 反馈权重 ──
   * 用户点"准确/不准确"后，按这些乘数调整来源实例的权重。改这里不用改代码。
   */
  feedback: feedbackWeightsOf({
    initial: process.env.COLLECTOR_WEIGHT_INITIAL,
    up: process.env.COLLECTOR_WEIGHT_UP,
    down: process.env.COLLECTOR_WEIGHT_DOWN,
    min: process.env.COLLECTOR_WEIGHT_MIN,
    max: process.env.COLLECTOR_WEIGHT_MAX,
  }),

  /**
   * ── 出站同步（"上级数据库"适配层）──
   * 传输方式与目标由配置决定；业务载荷与传输解耦（见 sync.service.ts）。
   */
  sync: syncConfig(),

  /**
   * ── 来源身份 ──
   * 收集器收到的上报全是匿名的，投票身份只能从请求本身推导（自报 ID → IP+UA 指纹）。
   * `fingerprintVotes=false` 时，只靠 IP+UA 认出来的来源只入审计、不计票 ——
   * 这是给"同一 NAT 后多实例被合并成一票"这种情况留的开关。
   */
  source: {
    fingerprintVotes: parseBool(process.env.COLLECTOR_SOURCE_FINGERPRINT_VOTES, true),
    /** 信任 `x-forwarded-for`（只在收集器确实位于可信反向代理之后时该为 true） */
    trustProxy: parseBool(process.env.COLLECTOR_TRUST_PROXY, false),
  },
} as const;
