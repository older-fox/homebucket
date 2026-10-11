import { createHash } from 'node:crypto';
import { parseJson } from './json';

/**
 * 物品身份的归一化与合并规则（纯函数，单测覆盖）。
 *
 * 收集器的核心价值不是"存"而是**合并**：同一个条码可能被五台实例分别报过，
 * 每台只知道自己的一部分（有人只填名字，有人补了型号和图片）。把这些观测拼成
 * 一份尽量完整的资料，是这一层唯一的职责。
 *
 * ── 合并规则（v1，显式写死，不做"智能"猜测）──
 * 1. 字段级「最近的非空观测胜出」：谁报得晚谁的值算数，但**空值永远不能覆盖已有值**。
 *    后来的实例只补它知道的部分，不会把别人填好的型号清空。
 * 2. 时间比较用 `observedAt`（默认取收到的时间）。离线实例几天后才同步的乱序补报
 *    因此能被正确处理：旧观测改不动新数据。
 * 3. 人工锁定（lockedFields）的字段**跳过自动合并**：纠错台改过的字段不该被下一条
 *    上报冲掉，否则纠错台等于白做。锁定只挡自动改写，不挡人工再改一次。
 * 4. 图片 URL 是**累加**的：照片只有"多"没有"错"，去重后最多留 MAX_IMAGE_URLS 张。
 * 5. `attributes`（容量/颜色/适配型号…）按 key 独立套用规则 1/3。
 * 6. 时间相同时后到的胜出（用 >= 而不是 >）：同时到达的两个观测没有先后可言，
 *    取最后收到的那个更符合"上报方刚刚确认过"的直觉。
 */

/** 可以从上报写入的物品字段 */
export interface ItemFields {
  name?: string | null;
  description?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  category?: string | null;
  baseUnit?: string | null;
  imageUrls?: string[] | null;
  attributes?: Record<string, string> | null;
}

/** 单值字段：这些字段互相竞争（字段级"最新非空胜出"） */
export const SCALAR_FIELDS = [
  'name',
  'description',
  'model',
  'manufacturer',
  'category',
  'baseUnit',
] as const;

export type ScalarField = (typeof SCALAR_FIELDS)[number];

/** 各字段容量上限（与 entities/column-spec.ts 的列长一致，截断发生在写入前） */
export const FIELD_LIMITS: Record<ScalarField, number> = {
  name: 200,
  description: 500,
  model: 120,
  manufacturer: 120,
  category: 80,
  baseUnit: 32,
};

export const MAX_IMAGE_URLS = 12;
export const MAX_ATTRIBUTES = 32;
export const MAX_ATTRIBUTE_KEY = 40;
export const MAX_ATTRIBUTE_VALUE = 200;
export const MAX_FINGERPRINT_PART = 80;
export const MAX_IMAGE_URL_LENGTH = 500;

/** 条码字符集：EAN/UPC 是纯数字，但也放行 Code128 常见的字母数字 */
export const BARCODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{3,63}$/;

export interface MergeOptions {
  observedAt: string;
  /**
   * 被人工锁定、拒绝改写的字段名（含 `attributes.<key>` 形式）。
   * 注意调用方按来源决定要不要传：锁定只拦自动上报，人工纠错仍然可以改被锁字段。
   */
  lockedFields?: string[];
  /**
   * 允许"清空"字段的字段名列表（只给人工纠错用）。
   *
   * 必须是**字段名列表**而不是一个布尔开关：字段经过 normalizeFields 之后，
   * "这次没提到"和"明确写了 null"都变成 null，光看值分不出来。
   * 自动上报里的 null 一律表示"这次没观测到"，绝不能用来清空别人报的值。
   */
  explicitNullFields?: readonly string[];
}

export interface MergeResult {
  next: ItemFields;
  /** 更新后的 { 字段名: 最后写入时间 }（含 attributes.<key>） */
  fieldUpdatedAt: Record<string, string>;
  /** 这次实际改动的字段（稳定顺序，便于测试与审计） */
  applied: string[];
}

/**
 * 条码归一化：去掉空格/连字符（打印出来的可读格式）、统一大写。
 * 这里**不判断合法性** —— 合法性由 DTO 的 @Matches 负责；
 * 归一化只保证"同一个条码的不同写法得到同一个身份键"。
 */
export function normalizeBarcode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.replace(/[\s\u200b\u00a0-]+/g, '').toUpperCase();
  return value === '' ? null : value;
}

/** 文本归一化：trim + 内部空白压缩 + 截断；空串视为"没报"（返回 null） */
export function normalizeText(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.replace(/\s+/g, ' ').trim();
  if (value === '') return null;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/** 图片 URL：只收 http(s)，去重（保持首次出现顺序），截断到上限 */
export function parseImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const value = entry.trim();
    if (value === '' || seen.has(value)) continue;
    if (value.length > MAX_IMAGE_URL_LENGTH) continue;
    if (!/^https?:\/\/\S+$/i.test(value)) continue;
    seen.add(value);
    urls.push(value);
    if (urls.length >= MAX_IMAGE_URLS) break;
  }
  return urls;
}

/**
 * 扩展属性：值统一转字符串（数字/布尔也收，方便上报方直接回传自己的字段），
 * 丢空值，key/值都截断，最多 MAX_ATTRIBUTES 个。
 */
export function parseAttributes(raw: unknown): Record<string, string> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const attributes: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(attributes).length >= MAX_ATTRIBUTES) break;
    const key = rawKey.replace(/\s+/g, ' ').trim().slice(0, MAX_ATTRIBUTE_KEY);
    if (key === '') continue;
    if (rawValue === null || rawValue === undefined || typeof rawValue === 'object') continue;
    const value = String(rawValue).replace(/\s+/g, ' ').trim().slice(0, MAX_ATTRIBUTE_VALUE);
    if (value === '') continue;
    attributes[key] = value;
  }
  return attributes;
}

/** 外部上报 body → 内部字段（DTO 管类型/长度，这里管业务归一化） */
export function normalizeFields(input: {
  name?: unknown;
  description?: unknown;
  model?: unknown;
  manufacturer?: unknown;
  category?: unknown;
  baseUnit?: unknown;
  imageUrls?: unknown;
  attributes?: unknown;
}): ItemFields {
  return {
    name: normalizeText(input.name, FIELD_LIMITS.name),
    description: normalizeText(input.description, FIELD_LIMITS.description),
    model: normalizeText(input.model, FIELD_LIMITS.model),
    manufacturer: normalizeText(input.manufacturer, FIELD_LIMITS.manufacturer),
    category: normalizeText(input.category, FIELD_LIMITS.category),
    baseUnit: normalizeText(input.baseUnit, FIELD_LIMITS.baseUnit),
    imageUrls: parseImageUrls(input.imageUrls),
    attributes: parseAttributes(input.attributes),
  };
}

/**
 * 无条码物品的指纹：名称 + 型号 + 制造商（归一化后）的 sha256。
 * 三者全空返回 null —— 这种上报没有任何身份信息，无法建档，由调用方拒绝。
 */
export function fingerprintOf(fields: ItemFields): string | null {
  const parts = [fields.name, fields.model, fields.manufacturer].map((part) =>
    (part ?? '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, MAX_FINGERPRINT_PART),
  );
  if (parts.every((part) => part === '')) return null;
  return createHash('sha256').update(parts.join('\u0001')).digest('hex');
}

/** 身份键：有条码用条码，没条码用指纹；两者都没有返回 null（无法建档） */
export function identityKeyOf(barcode: string | null, fields: ItemFields): string | null {
  if (barcode !== null) return `barcode:${barcode}`;
  const fingerprint = fingerprintOf(fields);
  return fingerprint === null ? null : `fingerprint:${fingerprint}`;
}

/**
 * 内容指纹：归一化字段的稳定序列化（键排序）后 sha256。
 * 用来识别"同一实例重复上报同一条资料"，也方便排查某来源是不是在刷量。
 */
export function contentHashOf(barcode: string | null, fields: ItemFields): string {
  const canonical = JSON.stringify({
    barcode: barcode ?? '',
    name: fields.name ?? '',
    description: fields.description ?? '',
    model: fields.model ?? '',
    manufacturer: fields.manufacturer ?? '',
    category: fields.category ?? '',
    baseUnit: fields.baseUnit ?? '',
    imageUrls: [...(fields.imageUrls ?? [])].sort(),
    attributes: Object.fromEntries(
      Object.entries(fields.attributes ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** 上报 body 原文 → ItemFields（重算时从库里回放历史用；坏 JSON 当作空字段） */
export function fieldsFromPayload(payload: string): ItemFields {
  const raw = parseJson<Record<string, unknown>>(payload, {});
  return normalizeFields(raw);
}

/** 字段是否被人工锁定 */
export function isLocked(lockedFields: readonly string[], field: string): boolean {
  return lockedFields.includes(field);
}

function hasValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value !== '';
}

/** 时间比较：a 不早于 b（ISO 字符串字典序 = 时间序） */
function notOlderThan(a: string, b: string | undefined): boolean {
  if (b === undefined || b === '') return true;
  return a >= b;
}

/**
 * 合并一次观测。调用方负责事务与持久化，这里只算"合并后是什么 + 改了什么"。
 *
 * @param current     库里当前字段值
 * @param currentAt   库里当前的 { 字段: 最后写入时间 }
 * @param incoming    归一化后的新观测
 * @param options     观测时间 + 人工锁定字段
 */
export function mergeItemFields(
  current: ItemFields,
  currentAt: Record<string, string>,
  incoming: ItemFields,
  options: MergeOptions,
): MergeResult {
  const locked = options.lockedFields ?? [];
  const next: ItemFields = { ...current };
  const fieldUpdatedAt: Record<string, string> = { ...currentAt };
  const applied: string[] = [];

  for (const field of SCALAR_FIELDS) {
    if (isLocked(locked, field)) continue;
    const value = incoming[field];
    if (value === null && (options.explicitNullFields ?? []).includes(field)) {
      // 人工清空：值置空 + 抹掉写入时间（下次自动上报可以重新填上，但"谁在什么时候清掉的"留在上报记录里）
      if (current[field] !== null && current[field] !== undefined) {
        next[field] = null;
        applied.push(field);
      }
      delete fieldUpdatedAt[field];
      continue;
    }
    if (!hasValue(value)) continue;
    const previous = current[field];
    if (hasValue(previous) && !notOlderThan(options.observedAt, currentAt[field])) continue;
    if (previous === value && fieldUpdatedAt[field] !== undefined) {
      // 值没变：只把"最后确认时间"往前推，不计入 applied，
      // 否则每台实例定期心跳式上报都会显示成"改动过"。
      fieldUpdatedAt[field] = options.observedAt;
      continue;
    }
    next[field] = value;
    fieldUpdatedAt[field] = options.observedAt;
    applied.push(field);
  }

  // 图片：累加去重（图片不属于"竞争字段"，锁定也不影响新增照片）
  const currentImages = current.imageUrls ?? [];
  const incomingImages = incoming.imageUrls ?? [];
  if (incomingImages.length > 0) {
    const merged = [...currentImages];
    const seen = new Set(currentImages);
    for (const url of incomingImages) {
      if (seen.has(url)) continue;
      if (merged.length >= MAX_IMAGE_URLS) break;
      seen.add(url);
      merged.push(url);
    }
    if (merged.length !== currentImages.length) {
      next.imageUrls = merged;
      applied.push('imageUrls');
    }
  }

  // 扩展属性：按 key 独立竞争（并受 attributes.<key> 形式的锁定控制）
  const currentAttributes = current.attributes ?? {};
  const incomingAttributes = incoming.attributes ?? {};
  const mergedAttributes: Record<string, string> = { ...currentAttributes };
  let attributesChanged = false;
  for (const key of Object.keys(incomingAttributes).sort()) {
    const stampKey = `attributes.${key}`;
    if (isLocked(locked, stampKey)) continue;
    const value = incomingAttributes[key];
    if (!hasValue(value)) continue;
    const previous = mergedAttributes[key];
    if (hasValue(previous) && !notOlderThan(options.observedAt, currentAt[stampKey])) continue;
    const existedInCurrent = Object.prototype.hasOwnProperty.call(currentAttributes, key);
    if (!existedInCurrent && Object.keys(mergedAttributes).length >= MAX_ATTRIBUTES) continue;
    if (previous === value && currentAt[stampKey] !== undefined) {
      fieldUpdatedAt[stampKey] = options.observedAt;
      continue;
    }
    mergedAttributes[key] = value;
    fieldUpdatedAt[stampKey] = options.observedAt;
    applied.push(stampKey);
    attributesChanged = true;
  }
  if (attributesChanged) {
    next.attributes = mergedAttributes;
  }

  return { next, fieldUpdatedAt, applied };
}

/** 把实体的 JSON 列还原成 ItemFields（合并/展示前比较用） */
export function stateFromColumns(row: {
  name?: string | null;
  description?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  category?: string | null;
  baseUnit?: string | null;
  imageUrls?: string | null;
  attributes?: string | null;
}): ItemFields {
  return {
    name: row.name ?? null,
    description: row.description ?? null,
    model: row.model ?? null,
    manufacturer: row.manufacturer ?? null,
    category: row.category ?? null,
    baseUnit: row.baseUnit ?? null,
    imageUrls: parseJson<string[]>(row.imageUrls, []),
    attributes: parseJson<Record<string, string>>(row.attributes, {}),
  };
}

/** 空的物品字段（重算时的起点） */
export function emptyFields(): ItemFields {
  return {
    name: null,
    description: null,
    model: null,
    manufacturer: null,
    category: null,
    baseUnit: null,
    imageUrls: [],
    attributes: {},
  };
}
