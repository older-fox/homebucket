export interface AuthUser {
  id: number;
  /** 邮箱选填（不再作为登录凭据） */
  email: string | null;
  username: string;
}

interface AuthResult {
  accessToken: string;
  user: AuthUser;
}

/**
 * 登录态：JWT 存在 cookie（hb_token）里，useApi 会自动带 Authorization 头。
 */
export function useAuth() {
  const api = useApi();
  const user = useState<AuthUser | null>('hb_user', () => null);

  function apply(result: AuthResult) {
    api.token.value = result.accessToken;
    user.value = result.user;
  }

  async function register(
    payload: { username: string; password: string; email?: string; inviteToken?: string },
    redirect = '/',
  ) {
    apply(await api.post<AuthResult>('/auth/register', payload));
    await navigateTo(redirect);
  }

  async function login(payload: { username: string; password: string }, redirect = '/') {
    apply(await api.post<AuthResult>('/auth/login', payload));
    await navigateTo(redirect);
  }

  async function fetchMe() {
    if (!api.token.value) return null;
    try {
      user.value = await api.get<AuthUser>('/auth/me');
    } catch {
      api.token.value = null;
      user.value = null;
    }
    return user.value;
  }

  async function logout() {
    api.token.value = null;
    api.familyId.value = null;
    user.value = null;
    await navigateTo('/login');
  }

  return { user, register, login, fetchMe, logout };
}
