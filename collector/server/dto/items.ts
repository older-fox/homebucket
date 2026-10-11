import { MAX_PAGE_SIZE, normalizePaging, type Paging } from '../utils/pagination';
import { Validation } from './validation';

/**
 * 公开查询接口的参数。
 *
 * pageSize 在这里就设上限（而不是只靠 normalizePaging 兜底）：让非法请求直接 400，
 * 界面开发时能立刻发现自己传错了，而不是被悄悄"纠正"成另一种分页。
 */
export interface QueryItemsDto {
  q?: string;
  page?: number;
  pageSize?: number;
}

export { MAX_PAGE_SIZE };

/** 迁移前是 QueryItemsDto + ValidationPipe，等价于这里的 parseQueryItems */
export function parseQueryItems(raw: Record<string, unknown>): QueryItemsDto {
  const v = new Validation();
  v.optionalString('q', raw.q, 120);
  const page = v.optionalInt('page', raw.page, 1);
  const pageSize = v.optionalInt('pageSize', raw.pageSize, 1);
  v.check();
  const dto: QueryItemsDto = {};
  if (typeof raw.q === 'string') dto.q = raw.q;
  if (page.provided && page.value !== undefined) dto.page = page.value;
  if (pageSize.provided && pageSize.value !== undefined) dto.pageSize = pageSize.value;
  return dto;
}

/** 搜索/列表共用的分页：DTO 只保证"是个 ≥1 的整数"，越界钳制交给 normalizePaging */
export function pagingOf(dto: { page?: number; pageSize?: number }): Paging {
  return normalizePaging({ page: dto.page, pageSize: dto.pageSize });
}
