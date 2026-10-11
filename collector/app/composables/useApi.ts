import { useRequestFetch } from '#imports';
import type { $Fetch } from 'ofetch';
import { loadToken } from './useAdminToken';

export interface ItemSummary {
  id: number;
  barcode: string | null;
  name: string | null;
  model: string | null;
  manufacturer: string | null;
  category: string | null;
  baseUnit: string | null;
  imageUrls: string[];
  contributionCount: number;
  instanceCount: number;
  updatedAt: string;
}

export interface FieldSource {
  field: string;
  value: string | string[] | null;
  contributionId: number | null;
  instanceId: number | null;
  instanceName: string | null;
  source: string;
  observedAt: string | null;
  agreedBy: number;
  locked: boolean;
}

export interface ItemDetail extends ItemSummary {
  identityKey: string;
  description: string | null;
  attributes: Record<string, string>;
  lockedFields: string[];
  firstSeenAt: string;
  fields: FieldSource[];
}

export interface ContributionView {
  id: number;
  instanceId: number | null;
  instanceName: string | null;
  source: string;
  observedAt: string;
  appliedFields: string[];
  payload: Record<string, string | string[] | null>;
  createdAt: string;
}

export interface AdminContribution extends ContributionView {
  itemId: number;
  itemBarcode: string | null;
  itemName: string | null;
  blocked: boolean;
  blockedReason: string | null;
  blockedAt: string | null;
}

export interface InstanceRow {
  id: number;
  name: string;
  keyPrefix: string;
  platform: string | null;
  version: string | null;
  contributionCount: number;
  blocked: boolean;
  blockedReason: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface AdminItem extends ItemSummary {
  lockedFields: string[];
  mergedIntoId: number | null;
}

export interface AdminItemDetail extends ItemDetail {
  mergedIntoId: number | null;
  contributions: AdminContribution[];
}

export interface Page {
  total: number;
  page: number;
  pageSize: number;
}

export interface ItemListPage extends Page {
  items: ItemSummary[];
}

export interface ContributionListPage extends Page {
  contributions: ContributionView[];
}

export interface AdminItemListPage extends Page {
  items: AdminItem[];
}

export interface AdminContributionListPage extends Page {
  contributions: AdminContribution[];
}

export interface InstanceListPage extends Page {
  instances: InstanceRow[];
}

export interface StatsView {
  totals: {
    items: number;
    barcoded: number;
    contributions: number;
    instances: number;
    reportingInstances: number;
    lastContributionAt: string | null;
  };
  coverage: Array<{ field: string; filled: number; percent: number }>;
  daily: Array<{ date: string; contributions: number }>;
  topInstances: Array<{ id: number; name: string; contributionCount: number; lastSeenAt: string | null }>;
  topManufacturers: Array<{ manufacturer: string; items: number }>;
  topCategories: Array<{ category: string; items: number }>;
}

export interface HealthView {
  status: string;
  service: string;
  version: string;
  nodeEnv: string;
  uptimeSec: number;
  registrationOpen: boolean;
  storage: { provider: string; dataFile: string; items: number; contributions: number; instances: number };
}

export interface AdminSessionView {
  ok: boolean;
  version: string;
  registrationOpen: boolean;
  scope: string;
}

export interface ItemPatchBody {
  name?: string;
  description?: string;
  model?: string;
  manufacturer?: string;
  category?: string;
  baseUnit?: string;
  imageUrls?: string[];
  attributes?: Record<string, string>;
  lockedFields?: string[];
  clearFields?: string[];
  note?: string;
}

export interface AdminContributionQuery {
  page?: number;
  pageSize?: number;
  itemId?: number;
  instanceId?: number;
  blocked?: boolean;
  source?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  admin?: boolean;
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

function readFields(source: unknown): Record<string, string[]> | undefined {
  if (!isRecord(source) || !isRecord(source.fields)) return undefined;
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(source.fields)) {
    if (Array.isArray(value)) {
      result[key] = value.filter((item): item is string => typeof item === 'string');
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** 有 HTTP 响应（哪怕是 4xx/5xx）才按服务端错误体解析；连不上时保持原始 TypeError。 */
function hasResponse(caught: unknown): boolean {
  return isRecord(caught) && caught.response !== undefined && caught.response !== null;
}

function buildApiError(caught: unknown): ApiError {
  const status = readNumber(caught, 'statusCode') ?? readNumber(caught, 'status') ?? 0;
  const data = isRecord(caught) ? caught.data : undefined;
  const rawMessage = isRecord(data) ? data.message : undefined;
  const message = Array.isArray(rawMessage)
    ? rawMessage.filter((part): part is string => typeof part === 'string').join('；')
    : (typeof rawMessage === 'string' && rawMessage) || `请求失败（HTTP ${status}）`;
  const code = readString(data, 'code') ?? `http.${status}`;
  return new ApiError(status, code, message, readFields(data));
}

function normalizeError(caught: unknown): Error {
  if (caught instanceof ApiError) return caught;
  if (hasResponse(caught)) return buildApiError(caught);
  const cause = isRecord(caught) ? caught.cause : undefined;
  if (cause instanceof Error) return cause;
  return caught instanceof Error ? caught : new Error(String(caught));
}

/**
 * 所有请求都走同一条路：非 2xx 一律抛 ApiError（带服务端的 code，界面按 code 说人话）。
 * SSR 期 useRequestFetch() 给的是 Nitro 的内部 $fetch，相对路径直接命中同进程的 /api。
 */
async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.admin) {
    const token = loadToken();
    if (!token) {
      throw new ApiError(401, 'admin.tokenMissing', '还没有填写管理令牌');
    }
    headers['x-admin-token'] = token;
  }
  // useRequestFetch() 运行时就是 ofetch 实例（SSR 期是 Nitro 的内部 $fetch，相对路径直接命中同进程 /api），
  // 但它的类型被 Nitro 的路由表收窄成了字面量路径；这里按 ofetch 的公开类型使用它。
  const fetcher = useRequestFetch() as $Fetch;
  try {
    return await fetcher<T>(path, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (caught) {
    throw normalizeError(caught);
  }
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const api = {
  health: () => request<HealthView>('/api/health'),

  search: (q: string, page = 1, pageSize = 20) =>
    request<ItemListPage>(`/api/v1/items${query({ q, page, pageSize })}`),

  item: (barcode: string) => request<ItemDetail>(`/api/v1/items/${encodeURIComponent(barcode)}`),

  itemContributions: (barcode: string, page = 1, pageSize = 20) =>
    request<ContributionListPage>(
      `/api/v1/items/${encodeURIComponent(barcode)}/contributions${query({ page, pageSize })}`,
    ),

  stats: () => request<StatsView>('/api/v1/stats'),

  admin: {
    session: () => request<AdminSessionView>('/api/admin/session', { admin: true }),
    items: (q: string, page = 1, pageSize = 20) =>
      request<AdminItemListPage>(`/api/admin/items${query({ q, page, pageSize })}`, { admin: true }),
    item: (id: number) => request<AdminItemDetail>(`/api/admin/items/${id}`, { admin: true }),
    patchItem: (id: number, body: ItemPatchBody) =>
      request<{ item: ItemDetail; applied: string[] }>(`/api/admin/items/${id}`, {
        method: 'PATCH',
        body,
        admin: true,
      }),
    merge: (targetId: number, sourceItemId: number) =>
      request<{ target: ItemDetail; source: { id: number; barcode: string | null; mergedIntoId: number | null } }>(
        `/api/admin/items/${targetId}/merge`,
        { method: 'POST', body: { sourceItemId }, admin: true },
      ),
    recomputeItem: (id: number) =>
      request<{ recomputedItems: number; requested: number; note: string }>(`/api/admin/items/${id}/recompute`, {
        method: 'POST',
        admin: true,
      }),
    contributions: (params: AdminContributionQuery) =>
      request<AdminContributionListPage>(`/api/admin/contributions${query({ ...params })}`, { admin: true }),
    blockContribution: (id: number, blocked: boolean, reason?: string) =>
      request<{ contribution: AdminContribution; item: ItemSummary }>(`/api/admin/contributions/${id}/block`, {
        method: 'POST',
        body: { blocked, reason },
        admin: true,
      }),
    instances: (page = 1, pageSize = 20) =>
      request<InstanceListPage>(`/api/admin/instances${query({ page, pageSize })}`, { admin: true }),
    blockInstance: (id: number, blocked: boolean, reason?: string) =>
      request<{ instance: InstanceRow; recomputedItems: number }>(`/api/admin/instances/${id}/block`, {
        method: 'POST',
        body: { blocked, reason },
        admin: true,
      }),
    recomputeAll: () => request<{ items: number }>('/api/admin/recompute', { method: 'POST', admin: true }),
  },
};

/** 组合式入口：与旧 SPA 的 `import { api }` 用法保持一致。 */
export function useApi() {
  return api;
}

/** 把任何异常变成一句可以显示的话（ApiError 用服务端消息，其它用兜底文案） */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'admin.tokenMissing') return '先在右上角填写管理令牌';
    if (error.code === 'admin.tokenInvalid') return '管理令牌不对';
    return error.message;
  }
  if (error instanceof TypeError) return '连不上收集器服务，检查它是否在运行';
  return error instanceof Error ? error.message : String(error);
}

/** 页面取数统一走它：把「成功的数据 / 可显示的错误 / HTTP 状态」收敛成一个值，SSR 与客户端都能用。 */
export interface Loaded<T> {
  data: T | null;
  error: string;
  status: number;
}

export async function capture<T>(run: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { data: await run(), error: '', status: 200 };
  } catch (caught) {
    return {
      data: null,
      error: errorMessage(caught),
      status: caught instanceof ApiError ? caught.status : 0,
    };
  }
}
