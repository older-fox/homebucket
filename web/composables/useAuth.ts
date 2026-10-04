export interface AuthUser {
  id: number;
  email: string;
  username: string;
}

interface AuthResult {
  accessToken: string;
  user: AuthUser;
}

/**
 * 登录态：JWT 存放在 cookie（hb_token）里，前端请求时手动带上 Authorization 头，
 * 这样即使前端以 0.0.0.0 对外、来源不固定，也不会受 CORS credentials 限制影响。
 */
export function useAuth() {
  const { public: pub } = useRuntimeConfig();
  const token = useCookie<string | null>('hb_token', {
    default: () => null,
    sameSite: 'lax',
    path: '/',
  });
  const user = useState<AuthUser | null>('hb_user', () => null);

  const authHeaders = () => (token.value ? { Authorization: `Bearer ${token.value}` } : {});

  async function request<T>(path: string, options: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
    return await $fetch<T>(`${pub.apiBase}${path}`, {
      method: options.method ?? 'POST',
      body: (options.body ?? undefined) as never,
      headers: authHeaders(),
    });
  }

  function apply(result: AuthResult) {
    token.value = result.accessToken;
    user.value = result.user;
  }

  async function register(payload: { email: string; username: string; password: string }) {
    apply(await request<AuthResult>('/auth/register', { body: payload }));
    await navigateTo('/');
  }

  async function login(payload: { email: string; password: string }) {
    apply(await request<AuthResult>('/auth/login', { body: payload }));
    await navigateTo('/');
  }

  async function fetchMe() {
    if (!token.value) return null;
    try {
      user.value = await request<AuthUser>('/auth/me', { method: 'GET' });
    } catch {
      token.value = null;
      user.value = null;
    }
    return user.value;
  }

  function logout() {
    token.value = null;
    user.value = null;
    navigateTo('/login');
  }

  return { token, user, register, login, fetchMe, logout };
}
