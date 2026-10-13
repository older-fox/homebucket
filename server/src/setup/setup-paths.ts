/**
 * 首启引导用到的路径白名单与退出码 —— 都是"必须几处保持一致"的常量，集中放这里。
 */

/**
 * 引导页自己需要的接口（受限启动与正常模式都要放行）。
 *
 * 路径按**去掉全局前缀之后**的形式写：`API_PREFIX` 是可配置的，把 `api` 写死进判断
 * 会在有人改前缀时静默失效（那时整个引导页都打不开，还很难查）。
 */
export const SETUP_PATHS = '/setup';

/**
 * 受限启动（连不上库）时额外放行的：
 *   · `/config` 前端要知道"当前需要初始化"（登录页、引导页都读它）
 *   · `/health` 让容器/探针仍然能判断进程活着
 */
export const RESTRICTED_ALLOWED_PREFIXES: readonly string[] = [SETUP_PATHS, '/config', '/health'];

/**
 * 正常模式下"尚未完成引导"时额外放行的：
 *   · `/admin/settings` 引导第 3/4 步直接复用实例设置接口，不另造一套写接口
 *   · `/config` `/health` 同上
 *
 * **刻意不含 `/auth`**：引导期间还没有账号，唯一的建号入口是 `POST /api/setup/admin`
 * （它会给实例管理员位、且要求库里一个用户都没有）。如果这里放行 `/auth`，
 * 任何人都能在实例还没初始化时抢先注册一个普通账号 —— 虽然拿不到实例管理员位，
 * 但"谁先注册谁占住用户名"这种事没必要留口子。引导完成后门禁关闭，`/auth` 自然恢复。
 */
export const GATE_ALLOWED_PREFIXES: readonly string[] = [
  SETUP_PATHS,
  '/admin/settings',
  '/config',
  '/health',
];

/**
 * "数据库配置已更新，请重启我"的退出码。
 *
 * 引导页写完 `/data/db.config.json` 后用它退出，`docker-entrypoint.sh` 认得这个码并
 * **只重启后端**（前端不动）。两边必须一致 —— `server/test/setup.test.mjs` 会核对。
 * 选 75 是因为进程平时不会用它：未捕获异常是 1，被信号杀是 143。
 */
export const SETUP_RESTART_EXIT_CODE = 75;

/**
 * 把请求路径规整成"去掉全局前缀"的形式，供上面几张白名单比较。
 * 例如 prefix=api 时：`/api/setup/status?x=1` → `/setup/status`
 */
export function normalizeApiPath(pathname: string, apiPrefix: string): string {
  const withoutQuery = pathname.split('?')[0];
  const prefix = apiPrefix ? `/${apiPrefix.replace(/^\/+|\/+$/g, '')}` : '';
  if (prefix && withoutQuery.startsWith(prefix)) return withoutQuery.slice(prefix.length) || '/';
  return withoutQuery;
}

/** pathname 是否命中白名单里的某一项（允许其后跟子路径） */
export function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
