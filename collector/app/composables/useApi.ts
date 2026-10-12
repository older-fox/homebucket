import { useRequestFetch } from '#imports';
import type { $Fetch } from 'ofetch';
import { handleUnauthorized, isSessionErrorCode } from './useAdminSession';
import type { AdminSessionView } from './useAdminSession';

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

export interface VoteCandidate {
  value: string;
  weight: number;
  count: number;
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
  /** 该字段是否走了投票（图片与锁定字段不投票，此处为 false） */
  voted?: boolean;
  /** 是否判出了唯一最高票；false 表示"按权重随机下发被上报的值" */
  decided?: boolean;
  /** 投给当前值的来源键（回答"这个值是谁报的"） */
  voteSources?: string[];
  /** 当前值的权重和 */
  voteWeight?: number;
  /** 当前值的票数 */
  voteCount?: number;
  /** 全部候选的权重和 */
  totalWeight?: number;
  /** 各候选的票数分布（未决时说明为什么未决） */
  tally?: VoteCandidate[];
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

export interface SourceRow {
  sourceKey: string;
  kind: string | null;
  label: string | null;
  weight: number;
  upvotes: number;
  downvotes: number;
  lastFeedbackAt: string | null;
  observations: number;
  items: number;
  lastObservedAt: string | null;
  /** 这个来源键后面出现过几个不同的 IP 哈希（>1 说明可能是共用出口） */
  ipHashes: number;
  userAgent: string | null;
}

/**
 * 权重基准值的**兜底默认**（服务端 `COLLECTOR_WEIGHT_INITIAL` 的默认值）。
 *
 * 真正的基准值随 `/api/admin/session` 一起下发（见 `adminSession.feedback.initial`），
 * 因为它是可配的 —— 界面写死 1 会让"改了配置的部署"永远看不到可疑来源。
 * 这个常量只在会话还没拿到时用（首屏、或降级路径）。
 */
export const INITIAL_SOURCE_WEIGHT = 1;

export interface SourceDetail extends SourceRow {
  recent: Array<{
    id: number;
    catalogItemId: number;
    itemName: string | null;
    barcode: string | null;
    field: string;
    value: string;
    observedAt: string;
    weightAtObservation: number;
  }>;
  feedback: Array<{
    id: number;
    catalogItemId: number;
    itemName: string | null;
    field: string;
    value: string | null;
    accurate: boolean;
    note: string | null;
    createdAt: string;
  }>;
}

export interface SourceListPage extends Page {
  sources: SourceRow[];
}

/** 出站同步的三种状态（服务端 `SyncStatus` 的镜像） */
export type SyncStatusFilter = 'pending' | 'ok' | 'failed';

/**
 * 一条出站同步账本。
 *
 * 后面 `name` / `imageUrls` 是服务端顺手带上的（避免清单页为每行再查一次条目），
 * 它们不属于账本本身，所以放宽为可空 —— 条目被合并或删除后账本还在。
 */
export interface SyncRow {
  id: number;
  catalogItemId: number;
  barcode: string | null;
  transport: string;
  status: string;
  attempts: number;
  lastAttemptAt: string | null;
  syncedAt: string | null;
  lastError: string | null;
  remoteRef: string | null;
  payloadHash: string | null;
  name: string | null;
  imageUrls: string[];
}

/** `GET /api/admin/sync` 的配置块。**不含令牌值**，只有 `hasToken` 布尔。 */
export interface SyncConfigView {
  transport: string;
  endpoint: string;
  dir: string;
  hasToken: boolean;
  intervalMinutes: number;
  batchSize: number;
  maxAttempts: number;
  includePhotos: boolean;
}

export interface SyncListView {
  /** false 时 `transport=off`：清单里若有一片 failed，那是"根本没配目标"而不是网络故障 */
  configured: boolean;
  config: SyncConfigView;
  counts: Record<SyncStatusFilter | 'total', number>;
  rows: SyncRow[];
}

/** 上行载荷项（与推送方向共用同一份构造，所以预览不可能与实际发送不一致） */
export interface SyncPayloadItem {
  id: number;
  barcode: string;
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  category: string | null;
  description: string | null;
  baseUnit: string | null;
  attributes: Record<string, string>;
  imageUrls: string[];
  contributions: number;
  sources: number;
  firstSeenAt: string;
  updatedAt: string;
  provenance: Array<{ field: string; label: string | null; observedAt: string }>;
}

export interface SyncPayload {
  format: string;
  generatedAt: string;
  collector: { version: string; dataFile: string };
  count: number;
  items: SyncPayloadItem[];
}

export interface SyncDetailView {
  row: SyncRow;
  /** 点进来想问的是"**现在**再送会送什么"，所以服务端是现算的，不是读历史载荷 */
  payload: SyncPayload | null;
}

export interface SyncRunView {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
  configured: boolean;
  errors: Array<{ itemId: number; barcode: string; message: string }>;
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
  if (hasResponse(caught)) {
    const error = buildApiError(caught);
    // 会话没了（未登录 / 过期 / 被吊销）：清掉本地状态并把人送回登录页，原页面进 redirect。
    if (isSessionErrorCode(error.code)) {
      handleUnauthorized(import.meta.client ? `${window.location.pathname}${window.location.search}` : undefined);
    }
    return error;
  }
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
  // 管理接口靠 httpOnly cookie 鉴权：同源 fetch 会自动带上，这里不手动加任何令牌头。
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
    session: () => request<AdminSessionView>('/api/admin/session'),
    items: (q: string, page = 1, pageSize = 20) =>
      request<AdminItemListPage>(`/api/admin/items${query({ q, page, pageSize })}`),
    item: (id: number) => request<AdminItemDetail>(`/api/admin/items/${id}`),
    patchItem: (id: number, body: ItemPatchBody) =>
      request<{ item: ItemDetail; applied: string[] }>(`/api/admin/items/${id}`, {
        method: 'PATCH',
        body,
      }),
    merge: (targetId: number, sourceItemId: number) =>
      request<{ target: ItemDetail; source: { id: number; barcode: string | null; mergedIntoId: number | null } }>(
        `/api/admin/items/${targetId}/merge`,
        { method: 'POST', body: { sourceItemId } },
      ),
    recomputeItem: (id: number) =>
      request<{ recomputedItems: number; requested: number }>(`/api/admin/items/${id}/recompute`, {
        method: 'POST',
      }),
    contributions: (params: AdminContributionQuery) =>
      request<AdminContributionListPage>(`/api/admin/contributions${query({ ...params })}`),
    blockContribution: (id: number, blocked: boolean, reason?: string) =>
      request<{ contribution: AdminContribution; item: ItemSummary }>(`/api/admin/contributions/${id}/block`, {
        method: 'POST',
        body: { blocked, reason },
      }),
    instances: (page = 1, pageSize = 20) =>
      request<InstanceListPage>(`/api/admin/instances${query({ page, pageSize })}`),
    blockInstance: (id: number, blocked: boolean, reason?: string) =>
      request<{ instance: InstanceRow; recomputedItems: number }>(`/api/admin/instances/${id}/block`, {
        method: 'POST',
        body: { blocked, reason },
      }),
    recomputeAll: () => request<{ items: number }>('/api/admin/recompute', { method: 'POST' }),
    sources: (page = 1, pageSize = 20, suspicious = false) =>
      request<SourceListPage>(
        `/api/admin/sources${query({ page, pageSize, suspicious: suspicious ? 'true' : undefined })}`,
      ),
    source: (key: string) => request<SourceDetail>(`/api/admin/sources/${encodeURIComponent(key)}`),
    setSourceWeight: (key: string, weight: number) =>
      request<SourceDetail>(`/api/admin/sources/${encodeURIComponent(key)}/weight`, {
        method: 'POST',
        body: { weight },
      }),
    sync: (status?: SyncStatusFilter) => request<SyncListView>(`/api/admin/sync${query({ status })}`),
    syncItem: (id: number) => request<SyncDetailView>(`/api/admin/sync/${id}`),
    resetSync: (id: number) =>
      request<{ ok: true; row: SyncRow }>(`/api/admin/sync/${id}/reset`, { method: 'POST' }),
    runSync: (force = false, limit?: number) =>
      request<SyncRunView>('/api/admin/sync/run', { method: 'POST', body: { force, limit } }),
  },
};

/** 组合式入口：与旧 SPA 的 `import { api }` 用法保持一致。 */
export function useApi() {
  return api;
}

/** 把任何异常变成一句可以显示的话（ApiError 用服务端消息，其它用兜底文案） */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (isSessionErrorCode(error.code)) return '登录已失效，请重新登录';
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
