/**
 * 首启引导门禁（全局）。
 *
 * 文件名以 `00.` 开头是为了排在 `auth.global.ts` **之前**执行 —— Nuxt 的全局中间件按
 * 文件名排序，而 auth.global.ts 会把没有 token 的请求送去 /login。必须先跑这个门禁：
 * 尚未初始化的实例连账号都还没有，把用户送去登录页是死路（登录接口此时也被服务端
 * 挡着，返回 503 setup.required）。
 *
 * 用裸 `$fetch` 而不是 `useApi`：这里只是"问一句还要不要引导"，不该动会话状态
 * （useApi 会写 cookie、并在 401 时清 token）。
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/setup') return;

  // SSR 时用服务端直连的那个 apiBase（浏览器端用同源代理的那个），否则服务端渲染时
  // 相对路径 $fetch 拿不到东西 —— 与 useSiteConfig 同一套取舍，只是这里要真拿到结果，
  // 所以显式区分两边。
  const config = useRuntimeConfig();
  const serverBase = (config as unknown as { apiBase?: string }).apiBase;
  const base = (import.meta.server ? serverBase || config.public.apiBase : config.public.apiBase) as string;

  try {
    const status = await $fetch<{ needsSetup?: boolean }>(`${base}/setup/status`);
    if (status?.needsSetup) return navigateTo('/setup');
  } catch {
    // 后端还没起来、或正在按新配置重启（引导第 1 步保存后会短暂不可用）——
    // 这种情况不跳转，等它回来后下一次导航自然会跳。
  }
});
