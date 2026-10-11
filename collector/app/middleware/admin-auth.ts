/**
 * 需要登录的页面（/admin、/audit、/password）用 `definePageMeta({ middleware: 'admin-auth' })` 挂上。
 *
 * **只在客户端执行**：会话令牌是 httpOnly cookie，SSR 阶段的服务端渲染拿不到浏览器 cookie，
 * 在服务端判断"是否登录"只会永远判成未登录、把已登录的首屏也踢走。所以服务端直接放行，
 * 由接口自身（401）兜底；客户端这里问一次 /api/admin/session 再决定要不要跳登录页。
 *
 * **首屏不能立刻跳**：客户端路由守卫跑在 `app:created` 钩子里，也就是 `vueApp.mount()` **之前**。
 * 首屏 DOM 是服务端渲染的受保护页面，此时若直接 `navigateTo`，Vue 会拿"登录页的 vdom"去比对
 * "受保护页面的 SSR DOM"，控制台报 `Hydration completed but contains mismatches`（实测未登录
 * 直开 /admin、/audit 每次都会报）。所以首次导航先放行（服务端与客户端渲染的都是同一个受保护
 * 页面，DOM 对得上），等 `app:mounted` 之后再执行这次跳转；之后的客户端导航（已完成挂载）直接跳。
 */
let appMounted = false;

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return;

  const { refresh } = useAdminSession();
  const user = await refresh();
  const target = user ? null : `/login?redirect=${encodeURIComponent(to.fullPath)}`;
  const nuxtApp = useNuxtApp();

  if (!appMounted) {
    nuxtApp.hooks.hookOnce('app:mounted', () => {
      appMounted = true;
      if (target) void nuxtApp.runWithContext(() => navigateTo(target, { replace: true }));
    });
    return;
  }

  if (target) return navigateTo(target);
});
