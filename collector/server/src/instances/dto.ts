import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { LENGTH } from '../entities/column-spec';
import { ToNum } from '../common/transforms';
import { IsInt, Min } from 'class-validator';

/**
 * 自我注册的 body。
 *
 * 为什么 name 是必填：收集器的全部价值建立在"这条资料是哪个实例报的"之上，
 * 审计页、封禁、来源可信度都要显示它。允许匿名的后果是审计页上一排 unknown，
 * 而这正是我们要避免的状态。一个默认值（主机名）由实例端自己填，服务端不做兜底。
 */
export class RegisterInstanceDto {
  @IsString()
  @Length(1, LENGTH.instanceName)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(LENGTH.platform)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LENGTH.instanceVersion)
  version?: string;
}

export class QueryInstancesDto {
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
