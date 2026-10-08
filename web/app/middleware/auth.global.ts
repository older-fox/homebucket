const PUBLIC_PATHS = ['/login', '/register'];

/**
 * 未登录时跳登录页；邀请页允许未登录访问（页面自己会引导）。
 * 注意：服务端也要执行，这样直接访问受保护页面会返回 302，
 * 而不是先渲染主页再由客户端跳走（那会闪一下、也容易出现布局异常）。
 *
 * 另外这里负责「开屏优先确定登录态」：只要带着 token，就在页面渲染前把
 * 当前用户与家庭列表取回来。因为所有页面数据都是 server:false（首屏不取数），
 * 如果不在这里先确定身份，首屏就会先渲染成未登录的样子（头像 "?"、家庭 "—"）
 * 再等客户端 onMounted 回填，出现明显闪动。
 */
export default defineNuxtRouteMiddleware(async (to) => {
  // 用 useApi 里那一份共享会话状态，而不是再 useCookie('hb_token') 一次：
  // useCookie 每次调用都会新建独立 ref（见 useApi 里的说明），fetchMe() 判定 401
  // 清掉 token 之后，这里读到的还会是自己创建时的旧值，于是「登录态已失效却不跳登录页」。
  const { token } = useApi();
  const isPublic = PUBLIC_PATHS.includes(to.path) || to.path.startsWith('/invite/');
  const toLogin = () =>
    navigateTo({ path: '/login', query: to.fullPath === '/' ? undefined : { redirect: to.fullPath } });

  if (!token.value && !isPublic) return toLogin();
  if (token.value && PUBLIC_PATHS.includes(to.path)) return navigateTo('/');

  if (!token.value) return;

  // 只在状态为空时请求：每次打开/刷新页面各一次，客户端路由跳转不会重复请求。
  const { user, fetchMe } = useAuth();
  if (!user.value) {
    await fetchMe();
    // fetchMe 遇到 401 会清掉 token —— 此时登录态确实失效，直接去登录页
    if (!token.value && !isPublic) return toLogin();
  }

  const { families, load } = useFamily();
  if (token.value && !families.value.length) {
    try {
      await load();
    } catch {
      // 家庭列表拉不到不应该让整页导航失败，页面自己有加载与重试
    }
  }
});
