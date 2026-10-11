/**
 * 分页参数归一化（纯函数）。
 *
 * 公开接口一定会被脚本按 pageSize=100000 扫，所以上限必须写死在这里，
 * 而不是指望调用方守规矩。page 从 1 开始；越界一律钳回合法区间，
 * 不报错 —— 分页参数没有"错"到需要拒绝整次查询的程度。
 */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface Paging {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function normalizePaging(raw: {
  page?: unknown;
  pageSize?: unknown;
}): Paging {
  const page = clampInt(raw.page, 1, 1, 1_000_000);
  const pageSize = clampInt(raw.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number.parseInt(raw.trim(), 10)
        : Number.NaN;
  if (!Number.isFinite(value) || Number.isNaN(value)) return fallback;
  const int = Math.trunc(value);
  if (int < min) return min;
  if (int > max) return max;
  return int;
}
