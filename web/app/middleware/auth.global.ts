const PUBLIC_PATHS = ['/login', '/register'];

/**
 * 未登录时跳登录页；邀请页允许未登录访问（页面自己会引导）。
 * 注意：服务端也要执行，这样直接访问受保护页面会返回 302，
 * 而不是先渲染主页再由客户端跳走（那会闪一下、也容易出现布局异常）。
 */
export default defineNuxtRouteMiddleware((to) => {
  const token = useCookie<string | null>('hb_token');
  const isPublic = PUBLIC_PATHS.includes(to.path) || to.path.startsWith('/invite/');
  if (!token.value && !isPublic) {
    return navigateTo({ path: '/login', query: to.fullPath === '/' ? undefined : { redirect: to.fullPath } });
  }
  if (token.value && PUBLIC_PATHS.includes(to.path)) {
    return navigateTo('/');
  }
});
