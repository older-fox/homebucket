import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { FIELD_LIMITS, MAX_ATTRIBUTE_KEY, MAX_ATTRIBUTE_VALUE, MAX_IMAGE_URLS } from '../common/identity';
import { LENGTH } from '../entities/column-spec';
import { ToBool, ToNum } from '../common/transforms';

export class QueryAdminContributionsDto {
  @IsOptional()
  @ToNum()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @ToNum()
  @IsInt()
  @Min(1)
  pageSize?: number;

  @IsOptional()
  @ToNum()
  @IsInt()
  itemId?: number;

  @IsOptional()
  @ToNum()
  @IsInt()
  instanceId?: number;

  @IsOptional()
  @ToBool()
  @IsBoolean()
  blocked?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  source?: string;
}

export class QueryAdminInstancesDto {
  @IsOptional()
  @ToNum()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @ToNum()
  @IsInt()
  @Min(1)
  pageSize?: number;
}

/** 人工改字段：只填要改的字段；没填的保持不动 */
export class PatchItemDto {
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
  @ArrayMaxSize(MAX_IMAGE_URLS)
  @IsString({ each: true })
  imageUrls?: string[];

  @IsOptional()
  @IsObject()
  attributes?: Record<string, string>;

  /** 锁定哪些字段（`attributes.<key>` 亦可）。锁定后自动上报不再改写它们，直到解锁 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  lockedFields?: string[];

  /**
   * 要清空的字段（把值删掉）。与"改值"分开是因为两者语义不同：
   * 改值＝我们知道的正确答案；清空＝这条资料是错的、宁可没有。
   * 清空只影响当前值，之后别的实例再报上来仍会填上（除非同时把它加进 lockedFields）。
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  clearFields?: string[];

  /** 纠错备注，存进这条 admin 上报的 payload 之外（只用于审计展示） */
  @IsOptional()
  @IsString()
  @MaxLength(LENGTH.blockReason)
  note?: string;
}

export class BlockContributionDto {
  @IsBoolean()
  blocked!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(LENGTH.blockReason)
  reason?: string;
}

export class BlockInstanceDto {
  @IsBoolean()
  blocked!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(LENGTH.blockReason)
  reason?: string;
}

export class MergeItemDto {
  /** 被并掉的条目 id（它的上报会全部转到目标条目上，它的条码以后重定向到目标） */
  @Type(() => Number)
  @IsInt()
  sourceItemId!: number;
}

export { MAX_ATTRIBUTE_KEY, MAX_ATTRIBUTE_VALUE };
