import type { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

/**
 * 统计"一批父记录各自有多少个子记录"。
 *
 * 为什么需要这个工具：Prisma 有 `_count: { select: { units: true } }` 这种写法，
 * 而 TypeORM 1.x **删除了** `loadRelationCountAndMap`（0.3.x 还有），
 * 官方也没有直接替代品。这里用一次 GROUP BY 聚合来顶替，避免退化成 N+1 查询。
 *
 * 用法：
 *   const counts = await countByForeignKey(itemUnitRepo, 'itemId', items.map((i) => i.id));
 *   counts.get(item.id) ?? 0
 *
 *   // 带条件：只数"当前处于取走状态"的 SN
 *   const out = await countByForeignKey(itemUnitRepo, 'itemId', ids, (qb) =>
 *     qb.andWhere('row.takenOutAt IS NOT NULL'),
 *   );
 *
 * @param repo        子表的 Repository
 * @param foreignKey  子表上指向父表的列名（实体属性名）
 * @param ids         父记录 id 列表
 * @param refine      追加条件（可选）。查询别名固定是 `row`，只应调用 andWhere 之类的追加方法
 */
export async function countByForeignKey<T extends ObjectLiteral>(
  repo: Repository<T>,
  foreignKey: keyof T & string,
  ids: number[],
  refine?: (qb: SelectQueryBuilder<T>) => SelectQueryBuilder<T>,
): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map();

  let builder = repo
    .createQueryBuilder('row')
    .select(`row.${foreignKey}`, 'parentId')
    .addSelect('COUNT(*)', 'total')
    .where(`row.${foreignKey} IN (:...ids)`, { ids });
  if (refine) builder = refine(builder);

  const rows = await builder
    .groupBy(`row.${foreignKey}`)
    .getRawMany<{ parentId: number | string; total: number | string }>();

  return new Map(rows.map((row) => [Number(row.parentId), Number(row.total)]));
}
