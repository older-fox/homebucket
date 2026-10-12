/**
 * 全站登录守卫：**未登录不进应用**，直接去登录页。
 *
 * ## 拦截口径：正面列出"要登录的页"，不是"非公开即受保护"
 * 中间件是全局的 —— 文件名必须带 **`.global.ts`** 后缀，这是 Nuxt 判定"全局"的
 * 唯一依据（`nuxt/dist/index.mjs` 里 `app.middleware.filter((mw) => mw.global)`）。
 * 踩过的坑：一开始只在 `nuxt.config.ts` 的 `app.middleware: ['login-gate']` 里写了
 * 名字，产物里它只被注册成**具名**中间件、没有任何页面引用，`globalMiddleware`
 * 里留下的其实是个空函数 —— 守卫一行都没跑，表现就是"未登录照样进首页"。
 *
 * 拦截对象由 `PROTECTED_PATHS` / `PROTECTED_PREFIXES` 正面列出，兜底是**放行**。
 * 反过来做（"不在这两个公开名单里就算受保护"）会把**不存在的地址**也送进登录页，
 * 于是 404 伪装成"需要授权" —— 见 `PROTECTED_PATHS` 上方那段注释。
 * 也不给每个受保护页挂 `definePageMeta({ middleware })`：那样每加一个新页面
 * 都留一个"忘了挂就等于静默对外开放"的坑，而正面清单漏写的代价只是多渲染一帧。
 *
 * 公开页是有意放行的：查条码 `/`、统计 `/stats`、条码详情 `/items/**` 只读公开数据，
 * 不碰纠错台。这也是老实例契约的要求（`/api/**` 由各路由自己的实例 key 把关）。
 *
 * ## 未登录时不渲染任何受保护内容（"不进入首页"）
 * 两条路一起用：
 *   1. **SSR 期**：能读到请求 cookie。没带会话 cookie 的请求**不可能**是已登录状态，
 *      于是直接 302 去登录页，一帧受保护内容都不渲染 —— 没有"先进入首页"这回事。
 *      带了 cookie 的请求可能是已登录（也可能已过期），照常渲染，交给客户端确认。
 *   2. **客户端**：中间件跑在 `app:created` 阶段（`vueApp.mount()` **之前**），
 *      但会话要问接口才知道，是异步的。此时若直接跳转，Vue 会拿登录页的 vdom 去比对
 *      受保护页面的 SSR DOM，报 `Hydration completed but contains mismatches`，
 *      而且用户会先看到一帧页面内容。所以这里**同步先返回**（不跳），由页面模板上的
 *      `v-if="ready"` 卡住内容（见 `useAuthGate`），等 `refresh()` 有答案再决定：
 *      已登录 → 放行渲染；未登录 → 跳登录页。
 *
 * ## 为什么不在 SSR 直接判"是否已登录"
 * 要把 cookie 解析、令牌哈希、会话过期全在渲染进程里再做一遍，等于把鉴权规则复制到
 * 第二个地方 —— 而这份复制品不会随服务端改动一起更新。让它去问同一个接口
 * （`/api/admin/session`）只有一份真相。SSR 只做"有没有 cookie"这种不需要真相的判断。
 *
 * ## 两个必须照做的实现细节（都是踩出来的）
 * 1. h3 助手要**显式导入**（见下方 import 注释）。
 * 2. SSR 跳转要用 `sendRedirect`，**不能** `return navigateTo(...)`（见中间件内注释）。
 */

/**
 * `getCookie` 必须**显式导入**，不能指望自动导入。
 *
 * 这个中间件在客户端会由 Nuxt 自动导入补上 `getCookie`，但同一份代码在服务端
 * 渲染时走的是另一条打包路径，自动导入不存在 —— 编译产物里 `getCookie` 既没被
 * 导入也没被定义，只在函数体里当自由变量用。结果是 `hasSessionCookie()` 抛
 * `ReferenceError`，中间件中断、跳转永远执行不到，SSR 就以 200 渲染出受保护页面
 * （正是"载入页面时不是登录态却进了首页"）。
 * 同类坑在 `server/utils/{sync-auth,source}.ts` 也踩过：凡是靠自动导入的 h3 助手，
 * 在不经由 Nuxt 运行时（或经由另一条打包路径）执行时都是 undefined。
 * `#imports` 里的 `useRequestEvent` 也显式导入，同理。
 */
import { getCookie, sendRedirect } from 'h3';
import { useRequestEvent } from '#imports';

const PUBLIC_PATHS = ['/', '/stats', '/login'];

/** 公开前缀：带参数的详情页、静态资源与老实例契约接口。 */
const PUBLIC_PREFIXES = ['/items/', '/api/', '/_nuxt/', '/_ipx/', '/photos/'];

/**
 * 需要登录的路径**逐一列出**，而不是"不在公开名单里就算受保护"。
 *
 * 踩过的坑（真缺陷，对照部署形态发现的）：最初写成"非公开即受保护"，
 * 于是 `GET /nope/deep/link`（一个不存在的地址）也被 302 送去登录页 ——
 * 匿名访客打错一个地址，得到的不是 404 而是登录页。这有两重害处：
 * 把"路由不存在"伪装成"需要授权"，以及让任何扫描器/爬虫看到的都是登录页。
 *
 * 所以这里改成正面清单。新增受保护页时要在这里登记，漏登记的后果是那个页面
 * 对未登录访客**多渲染一帧**、再被客户端 `useAuthGate()` 送走 ——
 * 而不是静默对外开放，这是刻意选的安全侧。
 * （`/sources` 用前缀匹配，因为它下面还有 `/sources/<key>` 详情页。）
 */
const PROTECTED_PATHS = ['/admin', '/audit', '/password', '/upstream'];

/** 需要登录的前缀：带子路径的受保护页（来源详情 `/sources/<key>`）。 */
const PROTECTED_PREFIXES = ['/sources'];

/** 会话 cookie 名，与服务端 `server/utils/auth.ts` 的 `SESSION_COOKIE` 保持一致。 */
const SESSION_COOKIE = 'hb_collector_session';

/**
 * SSR 期读请求 cookie。
 *
 * `useRequestEvent()` 在服务端返回当前 h3 事件；客户端调用它会返回 undefined
 * （这个分支本来就只在 `import.meta.server` 下走）。拿不到事件时按"没有 cookie"
 * 处理最安全：最坏情况是已登录用户的这一次请求被送去登录页，而登录页发现他已登录
 * 会立刻把他送回来（见 login.vue 的 onMounted），不会卡住人。
 */
function hasSessionCookie(): boolean {
  const event = useRequestEvent();
  if (!event) return false;
  return Boolean((getCookie(event, SESSION_COOKIE) ?? '').trim());
}

function isPublic(path: string): boolean {
  if (PUBLIC_PATHS.includes(path)) return true;
  return PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * 只有**确实存在且要登录**的页面才拦。
 *
 * 不做"非公开即受保护"的兜底：那样连不存在的地址都会被送去登录页（见上方
 * `PROTECTED_PATHS` 的注释）。`/sources/<key>` 这类子路径靠 `PROTECTED_PREFIXES`。
 */
function needsLogin(path: string): boolean {
  if (PROTECTED_PATHS.includes(path)) return true;
  return PROTECTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export default defineNuxtRouteMiddleware(async (to) => {
  // 公开页与"不存在的地址"都直接放行：前者本就该看，后者交给 Nuxt 出 404 ——
  // 把 404 变成登录页会把每个打错的地址都伪装成"需要授权"。
  if (isPublic(to.path) || !needsLogin(to.path)) return;

  if (import.meta.server) {
    /**
     * 只问一句"浏览器带没带会话 cookie"，不做校验。
     * 没带 → 一定未登录 → 302 走人，页面内容一帧都不渲染。
     * 带了 → 可能有效可能过期 → 渲染，客户端确认后再决定。
     */
    if (hasSessionCookie()) return;

    /**
     * 这里**必须**用 `sendRedirect` 而不是 `navigateTo`。
     *
     * `navigateTo` 在 SSR 中间件里的语义不是"立刻 302"：它注册一个
     * `router.afterEach` 钩子并**返回目标路径**，指望 router 走完这次导航后
     * 才把 `~renderResponse` 写成 302。而中间件返回值会被导航循环
     * （`entry.mjs` 的 `if (result) return result;`）当成"中断本次导航"，
     * 于是 `afterEach` 永远不会触发、`~renderResponse` 永远是空，渲染照常进行。
     * `sendRedirect` 直接写在当前请求事件上（状态码 + location 一次到位），
     * 不依赖 router 是否走完。
     *
     * 收尾**什么都不要 return**，就用裸 `return`。
     * 中间件的任何返回值都会被导航循环接管、把响应状态改掉：
     *   - `return false` / 抛错 → `showError(createError({status:404}))`，实测状态变 **404**；
     *   - `return abortNavigation(path)` → `abortNavigation` 带参会 `throw createError(path)`，
     *     实测状态变 **500**（`location` 头倒是留着的，看起来像"302 被降级"）；
     *   - `return navigateTo(...)` → 返回值被当成中断信号，`afterEach` 永不触发，状态原样 **200**。
     * `sendRedirect` 已经写好状态码、`location` 头与 `~renderResponse`，渲染阶段会因
     * `skipping render` 直接跳过页面组件；此时再返回任何东西都是画蛇添足。
     */
    const event = useRequestEvent();
    if (event) sendRedirect(event, `/login?redirect=${encodeURIComponent(to.fullPath)}`, 302);
    return;
  }

  /**
   * 客户端：这里**不能**等 `refresh()` 之后再跳 —— 那已经太晚了（内容渲染过一帧）。
   * 直接放行，由受保护页面的 `useAuthGate()` 渲染遮罩并在确认未登录时跳转。
   */
});
