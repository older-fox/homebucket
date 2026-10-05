const PUBLIC_PATHS = ['/login', '/register'];

/** 未登录时跳登录页；邀请页允许未登录访问（页面自己会引导） */
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return;
  const token = useCookie<string | null>('hb_token');
  const isPublic = PUBLIC_PATHS.includes(to.path) || to.path.startsWith('/invite/');
  if (!token.value && !isPublic) {
    return navigateTo({ path: '/login', query: to.fullPath === '/' ? undefined : { redirect: to.fullPath } });
  }
  if (token.value && PUBLIC_PATHS.includes(to.path)) {
    return navigateTo('/');
  }
});
