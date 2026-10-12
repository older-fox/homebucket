import { FIELD_LIMITS } from '../utils/identity';
import { Validation } from './validation';

/**
 * 老契约的上报 body（已部署的 HomeBucket 实例只会发这几个字段）。
 *
 * 与新协议的差别：`barcode` 必填（老客户端不会报"无条码物品"），
 * 且没有 imageUrls/attributes/observedAt —— 老客户端不采集这些。
 * `clientVersion` 只作为诊断信息收下，不参与合并。
 *
 * `sourceId` 是**可选**的：新版客户端可以自报一个稳定的安装 ID，
 * 让收集器在客户端换 IP 之后仍能认出"还是同一家"（见 utils/source.ts）。
 * 老客户端不发这个字段，收集器就回落到 IP+UA 指纹 —— 两者都能投票。
 */
export interface ObservationCompatDto {
  barcode: string;
  name?: string;
  manufacturer?: string;
  model?: string;
  category?: string;
  clientVersion?: string;
  sourceId?: string;
}

export function parseObservationCompat(raw: Record<string, unknown>): ObservationCompatDto {
  const v = new Validation();
  v.requiredString('barcode', raw.barcode, 1, 64);
  v.optionalString('name', raw.name, FIELD_LIMITS.name);
  v.optionalString('manufacturer', raw.manufacturer, FIELD_LIMITS.manufacturer);
  v.optionalString('model', raw.model, FIELD_LIMITS.model);
  v.optionalString('category', raw.category, FIELD_LIMITS.category);
  v.optionalString('clientVersion', raw.clientVersion, 32);
  v.optionalString('sourceId', raw.sourceId, 128);
  v.check();
  const dto: ObservationCompatDto = { barcode: raw.barcode as string };
  if (typeof raw.name === 'string') dto.name = raw.name;
  if (typeof raw.manufacturer === 'string') dto.manufacturer = raw.manufacturer;
  if (typeof raw.model === 'string') dto.model = raw.model;
  if (typeof raw.category === 'string') dto.category = raw.category;
  if (typeof raw.clientVersion === 'string') dto.clientVersion = raw.clientVersion;
  if (typeof raw.sourceId === 'string') dto.sourceId = raw.sourceId;
  return dto;
}
