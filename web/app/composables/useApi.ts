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
  const { public: pub } = useRuntimeConfig();
  const { t, te } = useI18n();
  const token = useCookie<string | null>(TOKEN_COOKIE, { default: () => null, path: '/' });
  const familyId = useCookie<string | null>(FAMILY_COOKIE, { default: () => null, path: '/' });

  function translateError(body?: ApiErrorBody, status = 0): string {
    if (body?.code) {
      const key = `api.${body.code}`;
      if (te(key)) return t(key);
    }
    if (status === 401) return t('errors.unauthorized');
    if (status === 403) return t('errors.forbidden');
    if (status === 404) return t('errors.notFound');
    if (status >= 500) return t('errors.server');
    return body?.message || t('errors.unknown');
  }

  /** 校验错误：把约束名翻译成人话，拼成一行 */
  function translateValidation(body?: ApiErrorBody): string {
    const fields = body?.fields ?? [];
    if (!fields.length) return t('validation.failed');
    return fields
      .map(({ field, constraints }) => {
        const label = constraints
          .map((name) => (te(`validation.${name}`) ? t(`validation.${name}`) : name))
          .join('、');
        return `${field}: ${label}`;
      })
      .join('；');
  }

  async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
    const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
    if (token.value) headers.Authorization = `Bearer ${token.value}`;
    if (familyId.value) headers['X-Family-Id'] = String(familyId.value);

    try {
      return await $fetch<T>(`${pub.apiBase}${path}`, { ...options, headers } as never);
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
