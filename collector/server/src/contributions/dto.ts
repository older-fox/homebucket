import { IsArray, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { FIELD_LIMITS, MAX_IMAGE_URL_LENGTH } from '../common/identity';

/**
 * 一条上报 = 某个实例对某个物品的**一次观测**。
 *
 * 字段刻意与 HomeBucket 的物品字段同名同义（名字/描述/型号/厂商/分类/基础单位/图片/扩展属性），
 * 这样实例端写适配器时不需要做字段映射表，联调成本最低。
 *
 * 注意这里**没有** quantity/price/位置/序列号：那些是"某个家庭的私有状态"，
 * 不属于公共物品资料；收集器只收"同一款商品对所有人都成立"的信息。
 */
export class CreateContributionDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LIMITS.name)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LIMITS.description)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LIMITS.model)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LIMITS.manufacturer)
  manufacturer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LIMITS.category)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LIMITS.baseUnit)
  baseUnit?: string;

  @IsOptional()
  @IsArray()
  @MaxLength(MAX_IMAGE_URL_LENGTH, { each: true })
  @IsString({ each: true })
  imageUrls?: string[];

  @IsOptional()
  @IsObject()
  attributes?: Record<string, string>;

  /**
   * 观测时间（ISO 字符串）。不传＝服务端此刻。
   * 允许实例补报历史（离线缓存后批量上传），但服务端会把未来时间夹回现在 ——
   * 否则一条 "9999-01-01" 的上报会永久霸占所有字段（合并规则是"最新观测胜出"）。
   */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  observedAt?: string;
}
