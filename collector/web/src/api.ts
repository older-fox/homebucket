import { loadToken } from './session';

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

/** 所有请求都走同一条路：非 2xx 一律抛 ApiError（带服务端的 code，界面按 code 说人话） */
async function request<T>(path: string, init: RequestInit & { admin?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  if (init.admin) {
    const token = loadToken();
    if (!token) {
      throw new ApiError(401, 'admin.tokenMissing', '还没有填写管理令牌');
    }
    headers.set('x-admin-token', token);
  }
  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  const body: unknown = text ? safeParse(text) : null;
  if (!response.ok) {
    const detail = (body ?? {}) as { code?: string; message?: string | string[]; fields?: Record<string, string[]> };
    const message = Array.isArray(detail.message)
      ? detail.message.join('；')
      : (detail.message ?? `请求失败（HTTP ${response.status}）`);
    throw new ApiError(response.status, detail.code ?? `http.${response.status}`, message, detail.fields);
  }
  return body as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
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
    request<{ items: ItemSummary[] } & Page>(`/api/v1/items${query({ q, page, pageSize })}`),

  item: (barcode: string) => request<ItemDetail>(`/api/v1/items/${encodeURIComponent(barcode)}`),

  itemContributions: (barcode: string, page = 1, pageSize = 20) =>
    request<{ contributions: ContributionView[] } & Page>(
      `/api/v1/items/${encodeURIComponent(barcode)}/contributions${query({ page, pageSize })}`,
    ),

  stats: () => request<StatsView>('/api/v1/stats'),

  admin: {
    session: () => request<{ ok: boolean; version: string; registrationOpen: boolean; scope: string }>(
      '/api/admin/session',
      { admin: true },
    ),
    items: (q: string, page = 1, pageSize = 20) =>
      request<{ items: AdminItem[] } & Page>(`/api/admin/items${query({ q, page, pageSize })}`, {
        admin: true,
      }),
    item: (id: number) => request<AdminItemDetail>(`/api/admin/items/${id}`, { admin: true }),
    patchItem: (
      id: number,
      body: {
        name?: string;
        description?: string;
        model?: string;
        manufacturer?: string;
        category?: string;
        baseUnit?: string;
        lockedFields?: string[];
        clearFields?: string[];
        note?: string;
      },
    ) =>
      request<{ item: ItemDetail; applied: string[] }>(`/api/admin/items/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
        admin: true,
      }),
    merge: (targetId: number, sourceItemId: number) =>
      request<{ target: ItemDetail; source: { id: number; barcode: string | null; mergedIntoId: number | null } }>(
        `/api/admin/items/${targetId}/merge`,
        { method: 'POST', body: JSON.stringify({ sourceItemId }), admin: true },
      ),
    recomputeItem: (id: number) =>
      request<{ recomputedItems: number; requested: number; note: string }>(`/api/admin/items/${id}/recompute`, {
        method: 'POST',
        admin: true,
      }),
    contributions: (params: {
      page?: number;
      pageSize?: number;
      itemId?: number;
      instanceId?: number;
      blocked?: boolean;
      source?: string;
    }) =>
      request<{ contributions: AdminContribution[] } & Page>(
        `/api/admin/contributions${query({ ...params })}`,
        { admin: true },
      ),
    blockContribution: (id: number, blocked: boolean, reason?: string) =>
      request<{ contribution: AdminContribution; item: ItemSummary }>(`/api/admin/contributions/${id}/block`, {
        method: 'POST',
        body: JSON.stringify({ blocked, reason }),
        admin: true,
      }),
    instances: (page = 1, pageSize = 20) =>
      request<{ instances: InstanceRow[] } & Page>(`/api/admin/instances${query({ page, pageSize })}`, {
        admin: true,
      }),
    blockInstance: (id: number, blocked: boolean, reason?: string) =>
      request<{ instance: InstanceRow; recomputedItems: number }>(`/api/admin/instances/${id}/block`, {
        method: 'POST',
        body: JSON.stringify({ blocked, reason }),
        admin: true,
      }),
    recomputeAll: () =>
      request<{ items: number }>('/api/admin/recompute', { method: 'POST', admin: true }),
  },
};

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
