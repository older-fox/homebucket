/** 多级包装单位：与后端 items/packaging.ts 同义（库存按最小单位，展示/录入按层级换算） */

export interface PackLevel {
  name: string;
  factor: number;
}

export interface UnitPart {
  name: string;
  factor: number;
  count: number;
}

export function useUnits() {
  /** 归一化层级：去空格、factor 整数 >1、按 factor 降序 */
  function levels(raw: unknown): PackLevel[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => ({
        name: String((item as PackLevel)?.name ?? '').trim(),
        factor: Number((item as PackLevel)?.factor),
      }))
      .filter((item) => item.name && item.name.length <= 20 && Number.isInteger(item.factor) && item.factor > 1)
      .sort((a, b) => b.factor - a.factor);
  }

  /** 是否配置了包装（最小单位名或任一层级） */
  function hasPackaging(baseUnit: string | null | undefined, packLevels: unknown): boolean {
    return Boolean(baseUnit) || levels(packLevels).length > 0;
  }

  /**
   * 「选一个计量档位」用的有序列表：下标 0 是最小单位（没有对应层级，值为 null），
   * 之后依次是各级包装。
   *
   * 为什么档位的 value 要用下标而不是名字：reka 的 SelectItem 不接受空字符串 value
   * （空串被它保留表示「清空选择」，直接抛错），而「最小单位」这一档本来就没有名字，
   * 只能编一个哨兵串 —— 但那又可能与用户自定的级别名撞车。用下标从结构上就没这问题。
   */
  function choices(raw: unknown): (PackLevel | null)[] {
    return [null, ...levels(raw)];
  }

  /**
   * 数量收敛到非负整数。
   * 注意不能只写 Math.max(0, Math.floor(value))：Math.max(0, NaN) 还是 NaN，
   * 一个 NaN 会一路乘进总数里（输入框清空、传进字符串时都可能出现）。
   */
  function toCount(value: unknown): number {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  /** 把最小单位总数拆成各级 + 余数 */
  function decompose(
    qty: number,
    packLevels: unknown,
  ): { parts: UnitPart[]; base: number } {
    let rest = toCount(qty);
    const parts: UnitPart[] = [];
    for (const level of levels(packLevels)) {
      const count = Math.floor(rest / level.factor);
      if (count > 0) parts.push({ ...level, count });
      rest -= count * level.factor;
    }
    return { parts, base: rest };
  }

  /** 各级数量 + 最小单位数量 → 最小单位总数 */
  function compose(counts: Record<string, number>, base: number, packLevels: unknown): number {
    let total = toCount(base);
    for (const level of levels(packLevels)) {
      total += toCount(counts[level.name]) * level.factor;
    }
    return total;
  }

  /**
   * 展示用明细，如「1箱 1提 3瓶」；未启用包装时返回纯数字（保证老数据展示不变）。
   */
  function format(qty: number, baseUnit: string | null | undefined, packLevels: unknown): string {
    const list = levels(packLevels);
    if (!baseUnit && list.length === 0) return String(qty);

    const { parts, base } = decompose(qty, list);
    const chunks = parts.map((part) => `${part.count}${part.name}`);
    if (base > 0 || chunks.length === 0) chunks.push(`${base}${baseUnit ?? ''}`);
    return chunks.join(' ');
  }

  return { levels, choices, hasPackaging, decompose, compose, format };
}
