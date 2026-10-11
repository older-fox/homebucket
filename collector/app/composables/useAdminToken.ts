import { reactive } from 'vue';

/**
 * 管理令牌只存在浏览器本地（localStorage），不写进 URL、不进 cookie：
 * 收集器的管理动作都是"运维手工做一次"的事，不需要会话、也不需要服务端存 token。
 *
 * Nuxt 注意：SSR 期没有 localStorage，所以所有读写都先判断 import.meta.client；
 * 服务端渲染时令牌一律看作空串（管理页也只在挂载后才去取数）。
 */
const STORAGE_KEY = 'hb-collector-admin-token';

export const session = reactive({
  token: '',
  verified: false,
});

export function loadToken(): string {
  if (session.token) return session.token;
  if (!import.meta.client) return '';
  try {
    session.token = window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    session.token = '';
  }
  return session.token;
}

export function saveToken(token: string): void {
  session.token = token.trim();
  session.verified = false;
  if (!import.meta.client) return;
  try {
    if (session.token) window.localStorage.setItem(STORAGE_KEY, session.token);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 隐私模式下 localStorage 会抛错，忽略即可：刷新后需要重新输入 */
  }
}

export function clearToken(): void {
  saveToken('');
}

/** 组合式入口，方便 `<script setup>` 里一次性拿到 session 与几个操作。 */
export function useAdminToken() {
  return { session, loadToken, saveToken, clearToken };
}
