export interface SiteConfig {
  /** 是否开放注册（后端 ALLOW_REGISTRATION） */
  allowRegistration: boolean;
}

/**
 * 后端公开的站点级开关（GET /api/config），登录前也要能拿到。
 * 用 useAsyncData 保证 SSR 首屏就有值、且各页面共用同一份缓存；
 * 请求失败时按「开放注册」兜底，避免后端异常把正常实例变成无法注册。
 */
export function useSiteConfig() {
  const { public: pub } = useRuntimeConfig();

  const { data } = useAsyncData('hb-site-config', () => $fetch<SiteConfig>(`${pub.apiBase}/config`), {
    default: () => ({ allowRegistration: true }) satisfies SiteConfig,
  });

  return computed(() => data.value);
}
