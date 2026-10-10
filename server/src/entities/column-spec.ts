/**
 * 跨 provider 的列规格常量（唯一来源）。
 *
 * 放在这里而不是各实体各写一份，是因为这些数字**必须在所有实体之间保持一致**：
 * 同一个值散落在 12 个文件里时，改一处漏十一处不会报错，只会在 MySQL 上
 * 报 "Specified key was too long" 或默默把已有列改成另一个长度（DDL 漂移）。
 */

/**
 * 普通字符串列的统一长度。
 *
 * 191 不是随手取的：MySQL 的 utf8mb4 下单个索引键最大 3072 字节（InnoDB DYNAMIC），
 * 191×4 = 764 字节，是能安全进唯一索引/组合索引的长度；Prisma 时代的表就是这个长度，
 * 保持它才能与迁移里的 DDL 逐字对齐（否则 `schema:log` 会报漂移）。
 */
export const STRING_LENGTH = 191;

/** DECIMAL(12,2) 上限 9,999,999,999.99，家庭记账足够；比 Prisma 时代的 (65,30) 省一大截 */
export const MONEY_PRECISION = 12;
export const MONEY_SCALE = 2;
