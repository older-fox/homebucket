import { IsNull } from 'typeorm';

/**
 * 「未软删除」条件的统一写法。
 *
 * `Item` / `ItemUnit` 用 `deletedAt` 表示软删除：删除动作只打一个时间戳，行还留在库里，
 * 这样活动历史里已经写好的物品名/序列号快照仍然指向真实存在的行，也不会连带删掉
 * 序列号与图片关联。代价是**所有读接口都必须带上这个条件**：列表、详情、搜索、
 * 位置计数、首页统计、扫码解析、CSV 导出 —— 漏一处就等于「删了还能看到 / 还能扫出来」。
 *
 * 用法：`{ ...alive(), familyId }` / `{ ...alive(), id }`。
 * 这里用函数而不是共享常量，避免同一个 FindOperator 实例被多个查询复用。
 */
export function alive(): { deletedAt: ReturnType<typeof IsNull> } {
  return { deletedAt: IsNull() };
}
