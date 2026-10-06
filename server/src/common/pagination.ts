/**
 * 列表分页参数归一化。
 *
 * 改造前这段 page/pageSize 的边界处理只写在 items 一处；抽出来是为了让后续
 * 需要分页的接口直接复用，避免每处各写一遍 min/max 钳制。
 */

export const DEFAULT_PAGE_SIZE = 50;
/** 单页上限：防止前端传个巨大的 pageSize 把库拖垮 */
export const MAX_PAGE_SIZE = 500;

export interface Paging {
  page: number;
  pageSize: number;
  /** 直接喂给 TypeORM 的 skip */
  skip: number;
}

export function normalizePaging(page?: number, pageSize?: number): Paging {
  const safePage = Math.max(1, Math.floor(page ?? 1) || 1);
  const safeSize = Math.min(Math.max(1, Math.floor(pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  return { page: safePage, pageSize: safeSize, skip: (safePage - 1) * safeSize };
}
