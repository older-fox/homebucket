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

  return { levels, hasPackaging, decompose, compose, format };
}
