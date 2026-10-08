import type { ApiError } from './useApi';

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
  const family = useFamily();
  const locations = useLocations();

  function apply(result: AuthResult) {
    api.token.value = result.accessToken;
    user.value = result.user;
  }

  /**
   * 清空一切与「当前这个人」绑定的客户端状态。
   *
   * 切换账号时只换 token 是不够的：下面是模块级（跨路由）缓存，都还留着上一位用户的
   * 数据，而页面又不会自动纠正，所以会出现「首页显示别的账号的家庭、其他数据也不对，
   * 刷新整页才恢复」的现象。刷新之所以有效，正是因为它把这堆状态全丢了。
   *
   *   hb_user                       当前用户
   *   hb_families / hb_family       家庭列表与选中的家庭（useFamily.reset）
   *   hb-loc-tree / hb-loc-contents 位置树与各位置内容（useLocations.reset）
   *   dashboard / items-list / …    useAsyncData 的数据缓存（clearNuxtData）
   */
  function clearSessionState() {
    api.token.value = null;
    api.familyId.value = null;
    user.value = null;
    family.reset();
    locations.reset();
    clearNuxtData();
  }

  /**
   * 登录/注册成功后接管会话：先把上一位用户留下的状态清掉，再按新身份重新拉家庭列表。
   * 立刻拉一次是为了让随后的跳转（`/`）一开始就拿到正确的家庭上下文，
   * 而不是由页面各自 onMounted 去补，从而避免中间态。
   */
  async function acceptSession(result: AuthResult) {
    clearSessionState();
    apply(result);
    await family.load(true);
  }

  async function register(
    payload: { username: string; password: string; email?: string; inviteToken?: string },
    redirect = '/',
  ) {
    await acceptSession(await api.post<AuthResult>('/auth/register', payload));
    await navigateTo(redirect);
  }

  async function login(payload: { username: string; password: string }, redirect = '/') {
    await acceptSession(await api.post<AuthResult>('/auth/login', payload));
    await navigateTo(redirect);
  }

  async function fetchMe() {
    if (!api.token.value) return null;
    try {
      user.value = await api.get<AuthUser>('/auth/me');
    } catch (error) {
      // 只有明确的 401 才代表登录态失效（useApi 已经顺手清了 token）；
      // 网络错误 / 5xx 不能把用户踢下线，否则后端抖动一下就会被登出。
      if ((error as ApiError)?.status === 401) {
        user.value = null;
        api.token.value = null;
      }
    }
    return user.value;
  }

  async function logout() {
    clearSessionState();
    await navigateTo('/login');
  }

  return { user, register, login, fetchMe, logout };
}
