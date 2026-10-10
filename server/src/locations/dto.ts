import { IsInt, IsOptional, IsString, Length } from 'class-validator';
import { IsOptionalNotNull } from '../common/validation';

/**
 * 位置域的入参 DTO。
 *
 * 从原 locations.module.ts 里原样搬出来，只做文件拆分：
 * class-validator 装饰器与可选性保持不变，否则全局 whitelist/校验规则会跟着变。
 */

export class CreateLocationDto {
  @IsString()
  @Length(1, 120)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  parentId?: number;

  @IsOptional()
  @IsInt()
  imageId?: number;
}

export class UpdateLocationDto {
  @IsOptionalNotNull()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  imageId?: number;
}

export class MoveLocationDto {
  @IsOptional()
  @IsInt()
  parentId?: number | null;

  @IsOptional()
  @IsInt()
  beforeId?: number | null;

  @IsOptional()
  @IsInt()
  afterId?: number | null;
}
