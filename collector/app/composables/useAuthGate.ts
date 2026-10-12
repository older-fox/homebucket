import { computed, onMounted, ref } from 'vue';
import { useAdminSession } from './useAdminSession';

/**
 * 受保护页面的"先别渲染"阀门。
 *
 * ## 为什么需要它
 * 应用令牌是 httpOnly cookie，**服务端渲染时读不到**，所以 SSR 出来的受保护页面
 * 到底是给已登录的人还是未登录的人看的，只有浏览器知道。而客户端路由中间件跑在
 * `app:created`（`vueApp.mount()` 之前），会话要问接口才知道 —— 是异步的，
 * 中间件里等不到答案就得先返回。
 *
 * 于是会出现这个窗口：DNS/首字节已到、页面组件已挂载、`refresh()` 还在飞。
 * 如果此时就把页面内容渲染出来，未登录用户就会**先看到一帧首页/管理页内容**
 * 再被换成登录页 —— 那正是"先进入首页"。这个 composable 让页面在这个窗口里
 * 只渲染一块过场（默认是居中转圈），未登录时直接跳走，受保护内容一帧都不出现。
 *
 * ## 用法
 * ```vue
 * const { ready, checking } = useAuthGate();
 * ```
 * 模板里包一层：`<template v-if="ready"> …页面内容… </template>`，
 * 并用 `checking` 渲染过场。
 */
export function useAuthGate() {
  const { session, refresh } = useAdminSession();

  /**
   * 首帧 **必须** 是"未就绪"。SSR 渲染出来的也必须是未就绪状态，否则客户端第一帧
   * 与 SSR DOM 不一致，Vue 报 hydration mismatch —— 而且服务端本来就没有能力
   * 判断"已登录"，所以"未就绪"是唯一诚实的初值。
   */
  const ready = ref(false);

  onMounted(async () => {
    const user = await refresh();
    /**
     * 未登录的人在这里离开。跳转交给服务端的 302 或页面的中间件做也可以，
     * 但那些路径都发生在客户端路由钩子里，而这里能拿到 `refresh()` 的真实结果，
     * 是唯一"知道答案"的地方。
     */
    if (!user) {
      const target = `${window.location.pathname}${window.location.search}`;
      const safe = target.startsWith('/') && !target.startsWith('//') ? target : '';
      await navigateTo(safe ? `/login?redirect=${encodeURIComponent(safe)}` : '/login', { replace: true });
      return;
    }
    ready.value = true;
  });

  return {
    /** 已确认登录，可以渲染受保护内容 */
    ready: computed(() => ready.value),
    /** 正在确认身份（页面应渲染过场而不是内容） */
    checking: computed(() => !ready.value),
    user: computed(() => session.user),
  };
}
