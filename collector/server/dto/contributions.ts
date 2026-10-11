import { FIELD_LIMITS, MAX_IMAGE_URL_LENGTH } from '../utils/identity';
import { Validation } from './validation';

/**
 * 一条上报 = 某个实例对某个物品的**一次观测**。
 *
 * 字段刻意与 HomeBucket 的物品字段同名同义（名字/描述/型号/厂商/分类/基础单位/图片/扩展属性），
 * 这样实例端写适配器时不需要做字段映射表，联调成本最低。
 *
 * 注意这里**没有** quantity/price/位置/序列号：那些是"某个家庭的私有状态"，
 * 不属于公共物品资料；收集器只收"同一款商品对所有人都成立"的信息。
 */
export interface CreateContributionDto {
  barcode?: string;
  name?: string;
  description?: string;
  model?: string;
  manufacturer?: string;
  category?: string;
  baseUnit?: string;
  imageUrls?: string[];
  attributes?: Record<string, string>;
  /**
   * 观测时间（ISO 字符串）。不传＝服务端此刻。
   * 允许实例补报历史（离线缓存后批量上传），但服务端会把未来时间夹回现在 ——
   * 否则一条 "9999-01-01" 的上报会永久霸占所有字段（合并规则是"最新观测胜出"）。
   */
  observedAt?: string;
}

export function parseCreateContribution(raw: Record<string, unknown>): CreateContributionDto {
  const v = new Validation();
  v.optionalString('barcode', raw.barcode, 64);
  v.optionalString('name', raw.name, FIELD_LIMITS.name);
  v.optionalString('description', raw.description, FIELD_LIMITS.description);
  v.optionalString('model', raw.model, FIELD_LIMITS.model);
  v.optionalString('manufacturer', raw.manufacturer, FIELD_LIMITS.manufacturer);
  v.optionalString('category', raw.category, FIELD_LIMITS.category);
  v.optionalString('baseUnit', raw.baseUnit, FIELD_LIMITS.baseUnit);
  v.optionalStringArray('imageUrls', raw.imageUrls, {
    maxItems: 999, // 迁移前 CreateContributionDto 对 imageUrls 只限每项长度，条数由 parseImageUrls 截断
    maxItemLength: MAX_IMAGE_URL_LENGTH,
  });
  const attributes = v.optionalRecord('attributes', raw.attributes);
  v.optionalString('observedAt', raw.observedAt, 32);
  v.check();

  const dto: CreateContributionDto = {};
  const text = (field: keyof CreateContributionDto): void => {
    const value = raw[field];
    if (typeof value === 'string') (dto as Record<string, unknown>)[field] = value;
  };
  text('barcode');
  text('name');
  text('description');
  text('model');
  text('manufacturer');
  text('category');
  text('baseUnit');
  text('observedAt');
  if (Array.isArray(raw.imageUrls)) dto.imageUrls = raw.imageUrls as string[];
  if (attributes !== undefined) {
    const record: Record<string, string> = {};
    for (const [key, value] of Object.entries(attributes)) record[key] = String(value);
    dto.attributes = record;
  }
  return dto;
}
