import { LENGTH } from '../database/column-spec';
import { Validation } from './validation';

/**
 * 自我注册的 body。
 *
 * 为什么 name 是必填：收集器的全部价值建立在"这条资料是哪个实例报的"之上，
 * 审计页、封禁、来源可信度都要显示它。允许匿名的后果是审计页上一排 unknown，
 * 而这正是我们要避免的状态。一个默认值（主机名）由实例端自己填，服务端不做兜底。
 */
export interface RegisterInstanceDto {
  name: string;
  platform?: string;
  version?: string;
}

export interface QueryInstancesDto {
  page?: number;
  pageSize?: number;
}

export function parseRegisterInstance(raw: Record<string, unknown>): RegisterInstanceDto {
  const v = new Validation();
  v.requiredString('name', raw.name, 1, LENGTH.instanceName);
  v.optionalString('platform', raw.platform, LENGTH.platform);
  v.optionalString('version', raw.version, LENGTH.instanceVersion);
  v.check();
  const dto: RegisterInstanceDto = { name: raw.name as string };
  if (typeof raw.platform === 'string') dto.platform = raw.platform;
  if (typeof raw.version === 'string') dto.version = raw.version;
  return dto;
}

export function parseQueryInstances(raw: Record<string, unknown>): QueryInstancesDto {
  const v = new Validation();
  const page = v.optionalInt('page', raw.page, 1);
  const pageSize = v.optionalInt('pageSize', raw.pageSize, 1);
  v.check();
  const dto: QueryInstancesDto = {};
  if (page.provided && page.value !== undefined) dto.page = page.value;
  if (pageSize.provided && pageSize.value !== undefined) dto.pageSize = pageSize.value;
  return dto;
}
