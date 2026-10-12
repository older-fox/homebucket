/**
 * 扫码「取走 / 放回」里可以脱离数据库的那部分判断。
 *
 * 扫描服务本身要 6 个 Repository + 装饰器，没法在零依赖的 node:test 里跑；但真正容易写错的
 * 恰是这几条规则——哪些目标能取走、放回时时间戳必须清成 null、该记哪条历史。抽成纯函数后
 * 由 server/test/take-out.test.mjs 直接覆盖，服务里只负责把它们接到查询与事务上。
 */

/** 能取走 / 放回的目标：整件物品、单条 SN（位置与模板不行） */
export type TakeableKind = 'item' | 'unit';

export function isTakeable(type: string): type is TakeableKind {
  return type === 'item' || type === 'unit';
}

/**
 * 不能取走时的兜底消息。
 *
 * 前端优先按 code（`scan.notTakeable`）查多语言文案，这里的 message 只是拿不到文案时的中文兜底，
 * 所以不必为位置/模板分别准备 code；但分开写至少让日志里能看出命中的是什么。
 */
export function notTakeableMessage(type: string): string {
  return type === 'location' ? '位置不能取走' : '模板不能取走';
}

/** 取走记一条 take_out，放回记一条 put_back（名字与 ACTIVITY_ACTIONS 一致） */
export function takeOutAction(takenOut: boolean): 'item.take_out' | 'item.put_back' {
  return takenOut ? 'item.take_out' : 'item.put_back';
}

/**
 * 消耗品（含它的 SN）不能被「取走」。
 *
 * 取走隐含"会放回"，而消耗品用掉就不回来了 —— 允许取走会出现语义自相矛盾的
 * "已取走的消耗品"，还会被「取走过久」提醒盯上。**只拦取走方向**：放回方向不拦，
 * 这样历史遗留的 takenOutAt 仍能被正常清掉（见 ItemsService.update 改成耗品时的清理）。
 */
export function consumableBlocksTakeOut(consumable: boolean, takenOut: boolean): boolean {
  return consumable && takenOut;
}

/** 上面那条规则被触发时给用户看的中文兜底（前端优先按 code 查多语言文案） */
export const CONSUMABLE_TAKE_MESSAGE = '消耗品不能取走，请用「用掉」';

/**
 * 取走 = 记下此刻；放回 = 必须清成 null。
 *
 * 放回时若保留旧时间，列表/搜索/位置页的"已取走"角标就不会消失，而且相对时间会继续增长。
 */
export function nextTakenOutAt(takenOut: boolean, now: Date = new Date()): Date | null {
  return takenOut ? now : null;
}
