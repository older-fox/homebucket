import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsOptionalNotNull } from '../common/validation';

export class ItemUnitDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  sn?: string;

  @IsOptional()
  @IsInt()
  locationId?: number;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  note?: string;
}

export class PackLevelDto {
  @IsString()
  @Length(1, 20)
  name: string;

  /** 每个该单位包含多少个下级/最小单位；整数且 >1 */
  @IsInt()
  @Min(2)
  factor: number;
}

export class CreateItemDto {
  @IsString()
  @Length(1, 120)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsString()
  @Length(4, 64)
  barcode?: string;

  /**
   * 系统追溯码：只能由 `POST /items/trace-code` 生成后原样提交，格式固定。
   * 更新接口（UpdateItemDto）故意不含该字段 —— 配合全局 whitelist 即"创建后不可变更"。
   */
  @IsOptional()
  @IsString()
  @Matches(/^HB-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/, { message: '追溯码格式不正确' })
  traceCode?: string;

  @IsOptional()
  @IsInt()
  locationId?: number;

  @IsOptional()
  @IsInt()
  templateId?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  tagIds?: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  imageIds?: number[];

  @IsOptional()
  @IsInt()
  coverImageId?: number;

  /** 最小单位名（如「瓶」）；不传 = 未启用包装 */
  @IsOptional()
  @IsString()
  @Length(1, 20)
  baseUnit?: string;

  /** 包装层级（从大到小，如 箱=24、提=6）；可为空数组表示不启用 */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackLevelDto)
  packLevels?: PackLevelDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemUnitDto)
  units?: ItemUnitDto[];
}

export class UpdateItemDto {
  @IsOptionalNotNull()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  quantity?: number;

  @IsOptionalNotNull()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptionalNotNull()
  @IsString()
  @Length(4, 64)
  barcode?: string;

  @IsOptional()
  @IsInt()
  locationId?: number;

  @IsOptionalNotNull()
  @IsArray()
  @IsInt({ each: true })
  tagIds?: number[];

  @IsOptionalNotNull()
  @IsArray()
  @IsInt({ each: true })
  imageIds?: number[];

  @IsOptional()
  @IsInt()
  coverImageId?: number;

  /** 最小单位名；置空（null/空串）表示关闭包装 */
  @IsOptional()
  @IsString()
  @Length(1, 20)
  baseUnit?: string;

  /** 包装层级；传空数组或 null 表示关闭包装 */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackLevelDto)
  packLevels?: PackLevelDto[];
}

/** 消耗 / 补货入参：按 level（包装层级名，缺省=最小单位）增减 amount 个 */
export class AdjustStockDto {
  @IsOptional()
  @IsString()
  @Length(1, 20)
  level?: string;

  @IsInt()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  note?: string;
}

/** 拆箱：只留痕，不改库存，只需一个可选备注 */
export class UnpackDto {
  @IsOptional()
  @IsString()
  @Length(0, 200)
  note?: string;
}

export class QueryItemsDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  sn?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  locationId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tagId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number;
}
