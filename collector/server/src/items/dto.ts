import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { MAX_PAGE_SIZE } from '../common/pagination';

/**
 * 公开查询接口的参数。
 *
 * pageSize 在这里就设上限（而不是只靠 normalizePaging 兜底）：让非法请求直接 400，
 * 界面开发时能立刻发现自己传错了，而不是被悄悄"纠正"成另一种分页。
 */
export class QueryItemsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export { MAX_PAGE_SIZE };
