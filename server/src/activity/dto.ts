import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/** 操作历史列表的查询参数（与 items 列表一致的分页边界） */
export class ActivityQueryDto {
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

  /** 只看某类对象的历史：item | unit | location */
  @IsOptional()
  @IsIn(['item', 'unit', 'location'])
  targetType?: string;
}
