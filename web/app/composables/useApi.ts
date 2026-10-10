import type { FetchOptions } from 'ofetch';

interface ApiErrorBody {
  code?: string;
  message?: string;
  fields?: { field: string; constraints: string[] }[];
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
}

const TOKEN_COOKIE = 'hb_token';
const FAMILY_COOKIE = 'hb_family';

/**
 * 统一请求入口：
 * - 自动带上 Authorization 与 X-Family-Id（家庭上下文）
 * - 错误按后端返回的 code 查多语言（key 为 `api.<code>`），查不到才回退后端 message
 */
export function useApi() {
  const config = useRuntimeConfig();
  /**
   * 用应用级的 $i18n 实例，而不是 useI18n()：
   * useI18n() 是组合式函数，只能在 setup 上下文里调用，而 useApi 还要在路由中间件里
   * 使用（开屏时先确定登录态、拉家庭列表）。在中间件里调 useI18n() 会抛
   * "Must be called at the top of a `setup` function"，把 SSR 直接变成 500。
   * $i18n 挂在 Nuxt 应用实例上，任何地方都能取到。
   */
  const i18n = useNuxtApp().$i18n;

  /**
   * 会话状态（token / 当前家庭）必须是**整个应用共享的一份**，不能每次 useApi() 各拿各的。
   *
   * Nuxt 的 useCookie() 每次调用都会新建一个 ref（见 nuxt/dist/app/composables/cookie.js：
   * 每次都 return 本函数内新建的 ref(cookieValue)，没有任何按名字的缓存），而且它把值写回
   * document.cookie 是靠一个 watch 异步完成的。直接在这里 useCookie 会带来两个后果：
   *   - useAuth() 里的 useApi 写完 token，useFamily() 里另一个 useApi 实例读到的还是它
   *     自己创建时的旧值（null）→ 登录成功后紧接着的 /families 请求不带 Authorization，
   *     后端返回 401「缺少登录凭证」，登录流程直接断掉；
   *   - 切换账号时同理，旧 token / 旧 X-Family-Id 会残留在别的实例里，串出上一个账号的数据。
   *
   * 因此这里用 useState 作为唯一事实来源（它会序列化进 SSR payload，天然跨 composable 共享），
   * 赋值时再写回 cookie 做持久化。
   */
  const tokenCookie = useCookie<string | null>(TOKEN_COOKIE, { default: () => null, path: '/' });
  const familyCookie = useCookie<string | null>(FAMILY_COOKIE, { default: () => null, path: '/' });
  const tokenState = useState<string | null>('hb-session-token', () => tokenCookie.value ?? null);
  const familyState = useState<string | null>('hb-session-family', () => familyCookie.value ?? null);

  const token = computed<string | null>({
    get: () => tokenState.value,
    set: (value) => {
      tokenState.value = value;
      tokenCookie.value = value;
    },
  });
  const familyId = computed<string | null>({
    get: () => familyState.value,
    set: (value) => {
      familyState.value = value;
      familyCookie.value = value;
    },
  });

  /**
   * 请求基地址：
   * - 浏览器端用 public.apiBase（默认 /api，走同源 nitro 代理，不存在跨域）
   * - 服务端用私有的 apiBase 直连后端 —— public.apiBase 是相对路径，服务端 $fetch
   *   解析不了它。这正是 runtimeConfig 里 apiBase 注释写的用途（SSR 直连后端）。
   *   私有配置不会下发到浏览器，所以这里必须用 import.meta.server 分支。
   */
  const base = import.meta.server
    ? ((config.apiBase as string) || (config.public.apiBase as string))
    : (config.public.apiBase as string);

  function translateError(body?: ApiErrorBody, status = 0): string {
    if (body?.code) {
      const key = `api.${body.code}`;
      if (i18n.te(key)) return i18n.t(key);
    }
    if (status === 401) return i18n.t('errors.unauthorized');
    if (status === 403) return i18n.t('errors.forbidden');
    if (status === 404) return i18n.t('errors.notFound');
    if (status >= 500) return i18n.t('errors.server');
    return body?.message || i18n.t('errors.unknown');
  }

  /** 校验错误：把约束名翻译成人话，拼成一行 */
  function translateValidation(body?: ApiErrorBody): string {
    const fields = body?.fields ?? [];
    if (!fields.length) return i18n.t('validation.failed');
    return fields
      .map(({ field, constraints }) => {
        const label = constraints
          .map((name) => (i18n.te(`validation.${name}`) ? i18n.t(`validation.${name}`) : name))
          .join(i18n.t('common.listSeparator'));
        return `${field}: ${label}`;
      })
      .join(i18n.t('common.clauseSeparator'));
  }

  async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
    const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
    if (token.value) headers.Authorization = `Bearer ${token.value}`;
    if (familyId.value) headers['X-Family-Id'] = String(familyId.value);

    try {
      return await $fetch<T>(`${base}${path}`, { ...options, headers } as never);
    } catch (error) {
      const err = error as { status?: number; statusCode?: number; data?: ApiErrorBody };
      const status = err.status ?? err.statusCode ?? 0;
      const body = err.data;

      if (status === 401 && token.value) {
        token.value = null;
      }

      const message =
        body?.code === 'validation.failed' ? translateValidation(body) : translateError(body, status);
      throw { status, code: body?.code ?? 'unknown', message } satisfies ApiError;
    }
  }

  return {
    request,
    get: <T>(path: string, query?: Record<string, unknown>) =>
      request<T>(path, { method: 'GET', query: query as never }),
    post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body as never }),
    patch: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'PATCH', body: body as never }),
    del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
    token,
    familyId,
  };
}
