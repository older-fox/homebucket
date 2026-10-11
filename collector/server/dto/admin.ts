import { LENGTH } from '../database/column-spec';
import { FIELD_LIMITS, MAX_IMAGE_URLS } from '../utils/identity';
import { Validation } from './validation';

/** 纠错台的上报列表筛选 */
export interface QueryAdminContributionsDto {
  page?: number;
  pageSize?: number;
  itemId?: number;
  instanceId?: number;
  blocked?: boolean;
  source?: string;
}

export interface QueryAdminInstancesDto {
  page?: number;
  pageSize?: number;
}

/**
 * 人工纠错：只写 payload 里出现的字段。
 *
 * `lockedFields`/`clearFields` 的语义见 AdminService.patchItem：
 * 前者是"以后自动上报不许改这些字段"，后者是"这次明确把这些字段清空"。
 * 注意 `clearFields` 必须是字段名列表而不是布尔开关 —— 字段经过归一化后，
 * "这次没提到"和"明确写了 null"都是 null，光看值分不出来（见 identity.ts 的 MergeOptions）。
 */
export interface PatchItemDto {
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

export interface BlockContributionDto {
  blocked: boolean;
  reason?: string;
}

export interface BlockInstanceDto {
  blocked: boolean;
  reason?: string;
}

export interface MergeItemDto {
  sourceItemId: number;
}

export function parseQueryAdminContributions(
  raw: Record<string, unknown>,
): QueryAdminContributionsDto {
  const v = new Validation();
  const page = v.optionalInt('page', raw.page, 1);
  const pageSize = v.optionalInt('pageSize', raw.pageSize, 1);
  const itemId = v.optionalInt('itemId', raw.itemId);
  const instanceId = v.optionalInt('instanceId', raw.instanceId);
  const blocked = v.optionalBoolean('blocked', raw.blocked);
  v.optionalString('source', raw.source, LENGTH.source);
  v.check();
  const dto: QueryAdminContributionsDto = {};
  if (page.provided && page.value !== undefined) dto.page = page.value;
  if (pageSize.provided && pageSize.value !== undefined) dto.pageSize = pageSize.value;
  if (itemId.provided && itemId.value !== undefined) dto.itemId = itemId.value;
  if (instanceId.provided && instanceId.value !== undefined) dto.instanceId = instanceId.value;
  if (blocked !== undefined) dto.blocked = blocked;
  if (typeof raw.source === 'string') dto.source = raw.source;
  return dto;
}

export function parseQueryAdminInstances(raw: Record<string, unknown>): QueryAdminInstancesDto {
  const v = new Validation();
  const page = v.optionalInt('page', raw.page, 1);
  const pageSize = v.optionalInt('pageSize', raw.pageSize, 1);
  v.check();
  const dto: QueryAdminInstancesDto = {};
  if (page.provided && page.value !== undefined) dto.page = page.value;
  if (pageSize.provided && pageSize.value !== undefined) dto.pageSize = pageSize.value;
  return dto;
}

export function parsePatchItem(raw: Record<string, unknown>): PatchItemDto {
  const v = new Validation();
  v.optionalString('name', raw.name, FIELD_LIMITS.name);
  v.optionalString('description', raw.description, FIELD_LIMITS.description);
  v.optionalString('model', raw.model, FIELD_LIMITS.model);
  v.optionalString('manufacturer', raw.manufacturer, FIELD_LIMITS.manufacturer);
  v.optionalString('category', raw.category, FIELD_LIMITS.category);
  v.optionalString('baseUnit', raw.baseUnit, FIELD_LIMITS.baseUnit);
  v.optionalStringArray('imageUrls', raw.imageUrls, { maxItems: MAX_IMAGE_URLS });
  const attributes = v.optionalRecord('attributes', raw.attributes);
  v.optionalStringArray('lockedFields', raw.lockedFields, { maxItems: 64 });
  v.optionalStringArray('clearFields', raw.clearFields, { maxItems: 64 });
  v.optionalString('note', raw.note, 200);
  v.check();

  const dto: PatchItemDto = {};
  const text = (field: keyof PatchItemDto): void => {
    const value = raw[field];
    if (typeof value === 'string') (dto as Record<string, unknown>)[field] = value;
  };
  text('name');
  text('description');
  text('model');
  text('manufacturer');
  text('category');
  text('baseUnit');
  text('note');
  if (Array.isArray(raw.imageUrls)) dto.imageUrls = raw.imageUrls as string[];
  if (Array.isArray(raw.lockedFields)) dto.lockedFields = raw.lockedFields as string[];
  if (Array.isArray(raw.clearFields)) dto.clearFields = raw.clearFields as string[];
  if (attributes !== undefined) {
    const record: Record<string, string> = {};
    for (const [key, value] of Object.entries(attributes)) record[key] = String(value);
    dto.attributes = record;
  }
  return dto;
}

/** blocked 是**必填布尔**：迁移前 BlockContributionDto 没有 @ToBool，字符串 'true' 不合法 */
export function parseBlockContribution(raw: Record<string, unknown>): BlockContributionDto {
  const v = new Validation();
  const blocked = v.requiredBoolean('blocked', raw.blocked);
  v.optionalString('reason', raw.reason, LENGTH.blockReason);
  v.check();
  const dto: BlockContributionDto = { blocked: blocked === true };
  if (typeof raw.reason === 'string') dto.reason = raw.reason;
  return dto;
}

export function parseBlockInstance(raw: Record<string, unknown>): BlockInstanceDto {
  const v = new Validation();
  const blocked = v.requiredBoolean('blocked', raw.blocked);
  v.optionalString('reason', raw.reason, LENGTH.blockReason);
  v.check();
  const dto: BlockInstanceDto = { blocked: blocked === true };
  if (typeof raw.reason === 'string') dto.reason = raw.reason;
  return dto;
}

export function parseMergeItem(raw: Record<string, unknown>): MergeItemDto {
  const v = new Validation();
  const sourceItemId = v.requiredInt('sourceItemId', raw.sourceItemId);
  v.check();
  return { sourceItemId: sourceItemId ?? 0 };
}
