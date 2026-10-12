import { reactive } from 'vue';
import { useRequestFetch, navigateTo } from '#imports';
import type { $Fetch } from 'ofetch';

/**
 * 管理端会话：账号 + 口令登录，令牌由服务端放在 httpOnly cookie 里。
 *
 * **前端永远拿不到、也不该存令牌**：这里只保留"当前登录的是谁"这份可显示的状态，
 * 所有请求都靠浏览器自动带上的同源 cookie 鉴权（不手动加任何 Authorization / token 头）。
 */

export interface AdminUser {
  id: number;
  username: string;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
}

export interface AdminSessionView {
  ok: true;
  version: string;
  registrationOpen: boolean;
  scope: 'admin';
  user: AdminUser;
  /** 权重配置（可配，所以不能在前端写死）：界面用 initial 判断"多低算可疑" */
  feedback: { initial: number; min: number; max: number };
}

export interface AdminPasswordResult {
  user: AdminUser;
  revokedSessions: number;
}

export interface AdminSessionState {
  /** 当前登录账号；null = 未登录（或还没查过，配合 checked 区分）。 */
  user: AdminUser | null;
  /** 是否已经问过服务端"现在是谁"；用于避免重复探测与首屏误判。 */
  checked: boolean;
  /** 有请求在飞（登录/登出/改密码/查会话）。 */
  pending: boolean;
  /** 最近一次非 401 的探测错误（网络不通之类），可显示。 */
  error: string;
  /**
   * 权重基准值（来自服务端的 `COLLECTOR_WEIGHT_INITIAL`）。
   *
   * 放在会话状态里而不是各页面各自定义常量：它是**服务端配置**，
   * 前端写死会让改了配置的部署在界面上判错"哪些来源可疑"。
   * 还没查到会话时保留 `null`，由 `INITIAL_SOURCE_WEIGHT` 兜底。
   */
  weightInitial: number | null;
  weightMin: number | null;
  weightMax: number | null;
}

/** 服务端三个"未登录"code：语义上都是"请重新登录"。 */
export const SESSION_ERROR_CODES = ['admin.sessionMissing', 'admin.sessionInvalid', 'admin.sessionExpired'] as const;

export function isSessionErrorCode(code: string): boolean {
  return (SESSION_ERROR_CODES as readonly string[]).includes(code);
}

export const adminSession = reactive<AdminSessionState>({
  user: null,
  checked: false,
  pending: false,
  error: '',
  weightInitial: null,
  weightMin: null,
  weightMax: null,
});

export class AdminSessionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AdminSessionError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readNumber(source: unknown, key: string): number | undefined {
  if (!isRecord(source)) return undefined;
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readString(source: unknown, key: string): string | undefined {
  if (!isRecord(source)) return undefined;
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

/** 把 ofetch 抛出的错误收敛成带 code 的 AdminSessionError（识别不了时按 HTTP 状态兜底）。 */
export function toAdminSessionError(caught: unknown): AdminSessionError {
  if (caught instanceof AdminSessionError) return caught;
  const status = readNumber(caught, 'status') ?? readNumber(caught, 'statusCode') ?? 0;
  const data = isRecord(caught) ? caught.data : undefined;
  const code = readString(data, 'code') ?? `http.${status}`;
  const raw = readString(data, 'message');
  const message = raw && raw.length > 0 ? raw : `请求失败（HTTP ${status}）`;
  const retry = readNumber(data, 'retryAfterSeconds');
  return new AdminSessionError(status, code, message, retry);
}

/** 会话类错误的统一人话（登录失效 / 连不上服务）。 */
export function adminErrorMessage(error: unknown): string {
  const parsed = toAdminSessionError(error);
  if (isSessionErrorCode(parsed.code)) return '登录已失效，请重新登录';
  if (parsed.status === 0) return '连不上收集器服务，检查它是否在运行';
  return parsed.message;
}

interface AdminRequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
}

async function adminRequest<T>(path: string, init: AdminRequestOptions = {}): Promise<T> {
  // 与 useApi 里的 request() 同一个坑：Nuxt 的内部 $fetch 类型被路由表收窄成字面量路径，
  // 直接写 $fetch<T>(path, …) 在 `nuxt typecheck` 下报 TS2769/TS2322；按 ofetch 的公开类型用。
  const fetcher = useRequestFetch() as $Fetch;
  // body 自己 JSON.stringify：字符串 body 会被 fetch 当成 text/plain，服务端读不出 JSON。
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  try {
    return await fetcher<T>(path, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (caught) {
    throw toAdminSessionError(caught);
  }
}

/**
 * 会话过期时把用户送回登录页（带 ?redirect= 回到原页面）。
 * 只在浏览器执行：SSR 期没有 cookie、也没有可导航的 router。
 */
let redirecting = false;
export function handleUnauthorized(redirectPath?: string): void {
  adminSession.user = null;
  adminSession.checked = true;
  if (import.meta.server || redirecting) return;
  redirecting = true;
  const safe =
    redirectPath && redirectPath.startsWith('/') && !redirectPath.startsWith('//') ? redirectPath : undefined;
  const target = safe ? `/login?redirect=${encodeURIComponent(safe)}` : '/login';
  void Promise.resolve(navigateTo(target, { replace: true }))
    .catch(() => {})
    .finally(() => {
      redirecting = false;
    });
}

/** 当前浏览器地址（含查询串），用于 401 之后原样跳回。SSR 期返回 undefined。 */
function currentPath(): string | undefined {
  if (!import.meta.client) return undefined;
  return `${window.location.pathname}${window.location.search}`;
}

let inflight: Promise<AdminUser | null> | null = null;

async function doRefresh(): Promise<AdminUser | null> {
  adminSession.pending = true;
  try {
    const view = await adminRequest<AdminSessionView>('/api/admin/session');
    adminSession.user = view.user;
    // 老版本服务端可能不带 feedback（回滚部署时会出现），所以逐项可空
    adminSession.weightInitial = view.feedback?.initial ?? null;
    adminSession.weightMin = view.feedback?.min ?? null;
    adminSession.weightMax = view.feedback?.max ?? null;
    adminSession.error = '';
    redirecting = false;
    return view.user;
  } catch (caught) {
    const error = toAdminSessionError(caught);
    // 401 只是"没登录"，不是异常：把 user 置空即可，绝不向上抛。
    if (isSessionErrorCode(error.code)) {
      adminSession.user = null;
      adminSession.error = '';
    } else {
      adminSession.error = adminErrorMessage(error);
    }
    return null;
  } finally {
    adminSession.checked = true;
    adminSession.pending = false;
  }
}

/** GET /api/admin/session：并发调用会合并成一次请求（中间件与顶栏都会用到）。 */
export function refresh(): Promise<AdminUser | null> {
  inflight ??= doRefresh().finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function login(username: string, password: string): Promise<AdminUser> {
  adminSession.pending = true;
  try {
    const result = await adminRequest<{ ok: true; user: AdminUser; expiresAt: string }>('/api/admin/login', {
      method: 'POST',
      body: { username, password },
    });
    adminSession.user = result.user;
    adminSession.checked = true;
    adminSession.error = '';
    redirecting = false;
    return result.user;
  } finally {
    adminSession.pending = false;
  }
}

/** 退出登录：服务端永远 200，即使失败也把本地状态清干净。 */
export async function logout(): Promise<void> {
  adminSession.pending = true;
  try {
    await adminRequest('/api/admin/logout', { method: 'POST' });
  } catch {
    /* 会话已失效也要能"退出"：忽略错误，下面照样清状态 */
  } finally {
    adminSession.user = null;
    adminSession.checked = true;
    adminSession.pending = false;
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<AdminPasswordResult> {
  adminSession.pending = true;
  try {
    const result = await adminRequest<{ ok: true; user: AdminUser; revokedSessions: number }>('/api/admin/password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    });
    adminSession.user = result.user;
    adminSession.checked = true;
    return { user: result.user, revokedSessions: result.revokedSessions };
  } catch (caught) {
    const error = toAdminSessionError(caught);
    if (isSessionErrorCode(error.code)) handleUnauthorized(currentPath());
    throw error;
  } finally {
    adminSession.pending = false;
  }
}

/** 组合式入口，方便 `<script setup>` 里一次性拿到状态与操作。 */
export function useAdminSession() {
  return { session: adminSession, refresh, login, logout, changePassword };
}
