/**
 * 实例配置注册表：**所有可配置项的唯一事实来源**。
 *
 * 每一项对应 `.env` 里的一个环境变量。`env.ts` 的 getter 通过同文件里的 `raw()` 读取，于是配置有了三级来源：数据库覆盖 > .env > 各 getter 的 `??` 默认值。
 * 本表的 `default` 必须与 `env.ts` 里那个回退值**逐字一致**，否则界面显示的"内置默认"
 * 就是假的（`settings.test.mjs` 会比对 `.env.example`，但默认值靠人工保持同步）。
 *
 * ── 为什么 `envName` 既是 id 又是键 ──
 * 注册表、`AppSetting.envName`、接口字段、前端文案 key 全部用同一个环境变量名，
 * 不引入 camelCase 别名：这个功能就是「env 变量 ↔ 表单字段」的一一映射，
 * 多一层映射只会多一处可能对不上。
 *
 * ── 不在这里的变量 ──
 *   · 数据库连接（DB_PROVIDER / DATABASE_URL / DB_HOST / DB_PORT / DB_USER /
 *     DB_PASSWORD / DB_NAME / DB_FILE_PATH）与 AUTO_MIGRATE：见 DB_ENV_NAMES 注释；
 *   · 前端 Nuxt 进程的 WEB_HOST / WEB_PORT / NUXT_* / API_PROXY_TARGET：见 WEB_ENV_NAMES。
 */

export type SettingGroup = 'general' | 'server' | 'logging' | 'storage' | 'bootstrap' | 'collection' | 'auth';

/**
 * 取值类型，同时决定界面用什么控件：
 *   string → 文本框    secret → 密码框（只写不读）  bool → 开关
 *   int    → 数字框    size   → 文本框（1gb / 10mb / 1024）  enum → 下拉
 *   cron   → 文本框（必须 6 段）  url → 文本框（http/https）
 */
export type SettingType = 'string' | 'secret' | 'bool' | 'int' | 'size' | 'enum' | 'cron' | 'url';

export interface SettingDef {
  /** 环境变量名；同时是 `AppSetting.envName`、接口字段名、前端文案 key 片段 */
  envName: string;
  group: SettingGroup;
  type: SettingType;
  /** 与 env.ts 里 `??` 的兜底值逐字一致 */
  default: string;
  /**
   * 是否只在**启动期**读取。为 true 时保存后必须重启才生效，界面会打「需重启生效」徽标。
   * 判断依据是消费点：主进程启动/模块构造期读的算 true（如 SERVER_PORT、JWT_SECRET、
   * S3 工厂），每请求/每轮读的算 false。
   */
  restartRequired: boolean;
  /** type === 'enum' 时的允许值 */
  enumValues?: string[];
  min?: number;
  max?: number;
  maxLength?: number;
  /** 是否允许空串（如 UPLOAD_DIR 留空表示"按 DATA_DIR 推导"） */
  allowEmpty?: boolean;
  /** 高危项的风险提示，对应前端 `settings.warning.<warning>` */
  warning?: string;
}

/**
 * 只能留在 `.env`、不进界面编辑的变量。
 *
 * 原因分两类：
 *   1. 数据库连接本身 —— 要连上库才能读"配置存在库里"，用配置去配数据库是循环；
 *      用户也明确要求这一组除外。
 *   2. `AUTO_MIGRATE` —— 它决定"启动时要不要跑迁移"，而迁移正是建出 AppSetting 表的那一步，
 *      同样是循环。它只在 `main.ts` 里读一次。
 * （`DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` 在 `.env.example` 里是
 *   注释形式，但 `env.ts` 支持它们，所以一并列进来。）
 */
export const DB_ENV_NAMES: ReadonlySet<string> = new Set([
  'DB_PROVIDER',
  'DATABASE_URL',
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'DB_FILE_PATH',
  'AUTO_MIGRATE',
]);

/**
 * 前端 Nuxt 进程自己的变量，不进 HomeBucket 设置页。
 *
 * 它们由 `docker-entrypoint.sh` / `web/nuxt.config.ts` 在**另一个进程**里读取，
 * 后端即便存下来也管不了那边（其中 `API_PROXY_TARGET` 还是构建期就烘焙进 .output 的），
 * 所以留在 `.env` 与文档里。
 */
export const WEB_ENV_NAMES: ReadonlySet<string> = new Set([
  'WEB_HOST',
  'WEB_PORT',
  'NUXT_PUBLIC_API_BASE',
  'NUXT_API_BASE',
  'API_PROXY_TARGET',
]);

export const SETTINGS: readonly SettingDef[] = [
  // ---- 通用 ----
  { envName: 'NODE_ENV', group: 'general', type: 'enum', enumValues: ['development', 'production', 'test'], default: 'development', restartRequired: true },

  // ---- 后端服务 ----
  { envName: 'SERVER_PORT', group: 'server', type: 'int', min: 1, max: 65535, default: '3001', restartRequired: true, warning: 'serverPort' },
  { envName: 'API_PREFIX', group: 'server', type: 'string', maxLength: 64, default: 'api', restartRequired: true, warning: 'apiPrefix' },
  { envName: 'CORS_ORIGIN', group: 'server', type: 'string', maxLength: 512, default: '*', restartRequired: true, warning: 'corsOrigin' },
  { envName: 'MAX_UPLOAD_SIZE', group: 'server', type: 'size', default: '1gb', restartRequired: true },

  // ---- 日志 ----
  { envName: 'LOG_LEVEL', group: 'logging', type: 'enum', enumValues: ['error', 'warn', 'info', 'debug', 'verbose'], default: 'info', restartRequired: true },
  { envName: 'LOG_FORMAT', group: 'logging', type: 'enum', enumValues: ['pretty', 'json', 'nginx'], default: 'pretty', restartRequired: true },
  { envName: 'LOG_ACCESS', group: 'logging', type: 'bool', default: 'true', restartRequired: true },

  // ---- 数据目录与文件存储 ----
  { envName: 'DATA_DIR', group: 'storage', type: 'string', maxLength: 512, default: 'data', restartRequired: true, warning: 'storagePath' },
  { envName: 'UPLOAD_DIR', group: 'storage', type: 'string', maxLength: 512, default: '', allowEmpty: true, restartRequired: true, warning: 'storagePath' },
  { envName: 'STORAGE_DRIVER', group: 'storage', type: 'enum', enumValues: ['local', 's3'], default: 'local', restartRequired: true, warning: 'storagePath' },
  { envName: 'S3_ENDPOINT', group: 'storage', type: 'url', maxLength: 512, default: '', allowEmpty: true, restartRequired: true },
  { envName: 'S3_REGION', group: 'storage', type: 'string', maxLength: 64, default: 'us-east-1', restartRequired: true },
  { envName: 'S3_BUCKET', group: 'storage', type: 'string', maxLength: 191, default: '', allowEmpty: true, restartRequired: true },
  { envName: 'S3_ACCESS_KEY', group: 'storage', type: 'secret', maxLength: 191, default: '', allowEmpty: true, restartRequired: true, warning: 's3Credentials' },
  { envName: 'S3_SECRET_KEY', group: 'storage', type: 'secret', maxLength: 191, default: '', allowEmpty: true, restartRequired: true, warning: 's3Credentials' },
  { envName: 'S3_FORCE_PATH_STYLE', group: 'storage', type: 'bool', default: 'true', restartRequired: true },

  // ---- 首次初始化 / 默认管理员 ----
  { envName: 'AUTO_CREATE_ADMIN', group: 'bootstrap', type: 'bool', default: 'true', restartRequired: true, warning: 'defaultAdmin' },
  { envName: 'DEFAULT_ADMIN_USERNAME', group: 'bootstrap', type: 'string', maxLength: 191, default: 'admin', restartRequired: true, warning: 'defaultAdmin' },
  { envName: 'DEFAULT_ADMIN_PASSWORD', group: 'bootstrap', type: 'secret', maxLength: 191, default: 'admin', restartRequired: true, warning: 'defaultAdmin' },
  { envName: 'DEFAULT_ADMIN_EMAIL', group: 'bootstrap', type: 'string', maxLength: 191, default: 'admin@example.com', restartRequired: true, warning: 'defaultAdmin' },

  // ---- 本地化与对外地址（运行期读取，保存即生效）----
  { envName: 'DEFAULT_CURRENCY', group: 'general', type: 'string', maxLength: 8, default: 'CNY', restartRequired: false },
  { envName: 'DEFAULT_LOCALE', group: 'general', type: 'string', maxLength: 16, default: 'zh-CN', restartRequired: false },
  { envName: 'PUBLIC_BASE_URL', group: 'general', type: 'url', maxLength: 512, default: '', allowEmpty: true, restartRequired: false },

  // ---- 认证 ----
  { envName: 'JWT_SECRET', group: 'auth', type: 'secret', maxLength: 191, default: 'homebucket-dev-secret', restartRequired: true, warning: 'jwtSecret' },
  { envName: 'JWT_EXPIRES_IN', group: 'auth', type: 'string', maxLength: 16, default: '7d', restartRequired: true },
  { envName: 'ALLOW_REGISTRATION', group: 'auth', type: 'bool', default: 'true', restartRequired: false },

  // ---- 条码数据收集（全部运行期读取；cron 靠 reregister() 热更）----
  { envName: 'DATA_COLLECTION_ENABLED', group: 'collection', type: 'bool', default: 'true', restartRequired: false },
  { envName: 'DATA_COLLECTION_ENDPOINT', group: 'collection', type: 'url', maxLength: 512, default: '', allowEmpty: true, restartRequired: false, warning: 'collectionEndpoint' },
  { envName: 'DATA_COLLECTION_SUBMIT', group: 'collection', type: 'bool', default: 'true', restartRequired: false },
  { envName: 'DATA_COLLECTION_TIMEOUT_MS', group: 'collection', type: 'int', min: 1, max: 300000, default: '1500', restartRequired: false },
  { envName: 'DATA_COLLECTION_SYNC_ENABLED', group: 'collection', type: 'bool', default: 'true', restartRequired: false },
  { envName: 'DATA_COLLECTION_SYNC_CRON', group: 'collection', type: 'cron', default: '0 0 3 * * *', restartRequired: false },
  { envName: 'DATA_COLLECTION_SYNC_MAX_ITEMS', group: 'collection', type: 'int', min: 1, max: 100000, default: '500', restartRequired: false },
  { envName: 'DATA_COLLECTION_SYNC_THROTTLE_MS', group: 'collection', type: 'int', min: 0, max: 60000, default: '250', restartRequired: false },
  { envName: 'DATA_COLLECTION_SYNC_MAX_FAILURES', group: 'collection', type: 'int', min: 1, max: 1000, default: '5', restartRequired: false },
  { envName: 'DATA_COLLECTION_PHOTO_TIMEOUT_MS', group: 'collection', type: 'int', min: 1000, max: 600000, default: '15000', restartRequired: false },
  { envName: 'DATA_COLLECTION_PHOTO_MAX_BYTES', group: 'collection', type: 'int', min: 1, max: 1073741824, default: '8388608', restartRequired: false },
  // 上限 12：收集器单条目图片上限就是 12，配更大没有意义
  { envName: 'DATA_COLLECTION_PHOTO_MAX_PER_ITEM', group: 'collection', type: 'int', min: 1, max: 12, default: '12', restartRequired: false },
];

const byEnv = new Map(SETTINGS.map((def) => [def.envName, def]));

/** 按环境变量名取注册项；不在表里返回 undefined */
export function settingByEnv(name: string): SettingDef | undefined {
  return byEnv.get(name);
}

/** 注册表覆盖的组，顺序即界面展示顺序 */
export const SETTING_GROUPS: readonly SettingGroup[] = [
  'general',
  'server',
  'logging',
  'storage',
  'bootstrap',
  'auth',
  'collection',
];
