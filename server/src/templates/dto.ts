import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateTemplateDto {
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

  @IsOptional()
  @IsInt()
  defaultLocationId?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  tagIds?: number[];
}

/** PATCH：所有字段可选（不继承 Create，避免必填字段约束） */
export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

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

  @IsOptional()
  @IsInt()
  defaultLocationId?: number;

  @IsOptional()
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
