import { reactive } from 'vue';

/**
 * 管理令牌只存在浏览器本地（localStorage），不写进 URL、不进 cookie：
 * 收集器的管理动作都是"运维手工做一次"的事，不需要会话、也不需要服务端存 token。
 */
const STORAGE_KEY = 'hb-collector-admin-token';

export const session = reactive({
  token: '' as string,
  verified: false,
});

export function loadToken(): string {
  if (session.token) return session.token;
  try {
    session.token = localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    session.token = '';
  }
  return session.token;
}

export function saveToken(token: string): void {
  session.token = token.trim();
  session.verified = false;
  try {
    if (session.token) localStorage.setItem(STORAGE_KEY, session.token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 隐私模式下 localStorage 会抛错，忽略即可：刷新后需要重新输入 */
  }
}

export function clearToken(): void {
  saveToken('');
}
