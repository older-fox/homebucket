import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Length, Min, ValidateNested } from 'class-validator';
import { IsOptionalNotNull } from '../common/validation';
import { PackLevelDto } from '../items/dto';

export class CreateTemplateDto {
  // `!` 只是类型层面的定值断言：TS 6 默认打开 strictPropertyInitialization，
  // 而编译产物（无初始值的字段声明）与 `name: string` 完全一致，运行时行为不变
  @IsString()
  @Length(1, 120)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  imageId?: number;

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

  /** 模板关联的商品条码（可选）：扫这个码可匹配到模板并预填 */
  @IsOptional()
  @IsString()
  @Length(4, 64)
  barcode?: string;

  @IsOptional()
  @IsInt()
  defaultLocationId?: number;

  /** 最小单位名（如「瓶」）；不传 = 未启用包装 */
  @IsOptional()
  @IsString()
  @Length(1, 20)
  baseUnit?: string;

  /** 包装层级（从大到小）；套用模板时带到新建的物品上 */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackLevelDto)
  packLevels?: PackLevelDto[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  tagIds?: number[];
}

/** PATCH：所有字段可选（不继承 Create，避免必填字段约束） */
export class UpdateTemplateDto {
  @IsOptionalNotNull()
  @IsString()
  @Length(1, 120)
  name?: string;

  /** 模板关联的商品条码（可选）：扫这个码可匹配到模板并预填 */
  @IsOptionalNotNull()
  @IsString()
  @Length(4, 64)
  barcode?: string;


  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  imageId?: number;

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

  @IsOptional()
  @IsInt()
  defaultLocationId?: number;

  /** 最小单位名；置空表示关闭包装 */
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

  @IsOptionalNotNull()
  @IsArray()
  @IsInt({ each: true })
  tagIds?: number[];
}

export class UseTemplateDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  locationId?: number;
}
