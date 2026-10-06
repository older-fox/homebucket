import type { ValueTransformer } from 'typeorm';

/**
 * 金额列的通用 transformer。
 *
 * 为什么需要它：同一个实体要同时跑在 MySQL 与 SQLite 上，而两边的 decimal 行为不一致 ——
 * MySQL 的 mysql2 驱动会把 DECIMAL 读成**字符串**（避免精度丢失），SQLite 则读成 number。
 * 如果不在这一层抹平，所有调用方都得自己写 `Number(row.price)`，很容易漏。
 *
 * 这里统一成 number，与改造前的业务代码契约保持一致（旧代码到处 `Number(item.price)`）。
 */
export const decimalNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | number | null | undefined) => (value === null || value === undefined ? 0 : Number(value)),
};
