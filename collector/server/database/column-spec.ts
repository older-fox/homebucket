/**
 * 列长度集中定义：EntitySchema、迁移、校验都跟着这里走。
 *
 * 为什么不用 TypeORM 的默认长度 191：那是 MySQL utf8mb4 单列索引的遗留限制。
 * 收集器收的是各家实例填的公共资料，宁可把每一列的容量写清楚，
 * 也不要"默认值碰巧够用"。
 */
export const LENGTH = {
  /** 身份键：`barcode:<条码>` 或 `fingerprint:<sha256>` */
  identityKey: 160,
  barcode: 64,
  name: 200,
  description: 500,
  model: 120,
  manufacturer: 120,
  category: 80,
  baseUnit: 32,
  /** 锁定字段名单（JSON 数组） */
  lockedFieldsJson: 500,
  /** 原始上报 body（JSON），只做审计与重算，不做查询条件 */
  payloadJson: 6000,
  appliedFieldsJson: 500,
  /** ISO-8601 UTC 字符串，固定 24 字符 */
  isoTime: 32,
  keyPrefix: 24,
  keyHash: 64,
  instanceName: 120,
  platform: 80,
  instanceVersion: 32,
  source: 32,
  blockReason: 200,
} as const;
