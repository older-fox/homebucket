import type { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

/** 聚合结果行 → Map<父 id, 计数>。两个 provider 都可能把 COUNT / 主键读成字符串，统一成 number */
function toCountMap(
  rows: { parentId: number | string; total: number | string }[],
): Map<number, number> {
  return new Map(rows.map((row) => [Number(row.parentId), Number(row.total)]));
}

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

  return toCountMap(rows);
}

/**
 * 统计"一批父记录各自关联了多少个子记录"，用于**子表没有外键列**的关系。
 *
 * `countByForeignKey` 是按子表上的外键列分组的，而隐式多对多（如 Item ↔ Tag 的连接表
 * _ItemTags）根本没有对应实体、拿不到列名。这里改为 innerJoin 关系属性再 GROUP BY
 * 父表主键 —— 同样是"一次聚合替代 N+1"，而不是每个父记录查一次。
 *
 * 用法：
 *   const counts = await countByJoin(this.tags, { relation: 'items', ids: tagIds });
 *   counts.get(tag.id) ?? 0
 *
 * 约定：子实体必须有 `id` 主键列（`COUNT(child.id)` 数的是非空子行），父表主键默认 'id'。
 * relation / parentKey 都是代码里写死的字面量，不接受外部输入（会拼进 SQL）。
 */
export async function countByJoin<T extends ObjectLiteral>(
  repo: Repository<T>,
  options: { relation: string; ids: number[]; parentKey?: string },
): Promise<Map<number, number>> {
  const { relation, ids, parentKey = 'id' } = options;
  if (ids.length === 0) return new Map();

  const rows = await repo
    .createQueryBuilder('parent')
    .innerJoin(`parent.${relation}`, 'child')
    .select(`parent.${parentKey}`, 'parentId')
    .addSelect('COUNT(child.id)', 'total')
    .where(`parent.${parentKey} IN (:...ids)`, { ids })
    .groupBy(`parent.${parentKey}`)
    .getRawMany<{ parentId: number | string; total: number | string }>();

  return toCountMap(rows);
}
