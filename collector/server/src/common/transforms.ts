import { Transform } from 'class-transformer';

/**
 * 查询串里的布尔值：`?blocked=true` 到 DTO 时是字符串，不是布尔。
 * 只认显式的 true/1/yes —— 其它一律当 false，避免 "false" 被 `Boolean("false")` 判成 true
 * 这种经典陷阱（那会让"只看未屏蔽"的筛选变成"只看已屏蔽"）。
 */
export function toBoolean({ value }: { value: unknown }): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const text = String(value).toLowerCase();
  if (text === 'true' || text === '1' || text === 'yes') return true;
  return false;
}

/** 查询串里的数字；读不懂就交给 class-validator 报错，不要在这里悄悄兜底 */
export function toNumber({ value }: { value: unknown }): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : (value as number);
}

export const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
export const ToBool = () => Transform(toBoolean);
export const ToNum = () => Transform(toNumber);
