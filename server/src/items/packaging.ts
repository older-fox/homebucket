/**
 * 多级包装单位（如 箱=24、提=6、瓶=1）。
 *
 * 设计要点：
 *   · 库存只存**最小单位**总数（Item.quantity），包装只影响录入与展示，
 *     所以「拆箱」在数据上没有动作——永远自动换算。
 *   · 层级以 JSON 字符串存（不用 Json 列，SQLite/MySQL 通吃），
 *     `baseUnit` 为空 = 未启用包装，所有函数都短路成纯数字，保证零回归。
 *   · 换算一律**从大到小贪心**：factor 严格递减时结果唯一。
 */

export interface PackLevel {
  name: string;
  factor: number;
}

/** 最多允许的包装层级（防止把 text 写爆、也让贪心换算保持可读） */
export const MAX_PACK_LEVELS = 5;

export interface DecomposedPart {
  name: string;
  factor: number;
  count: number;
}

/**
 * 归一化用户输入：去空格、去重、factor 必须为整数且 >1、按 factor 严格递减、最多 5 级。
 * 非法项直接丢弃（DTO 已做基础校验，这里是最后的兜底，保证写库的值一定可用）。
 */
export function normalizePackLevels(input: unknown): PackLevel[] {
  if (!Array.isArray(input)) return [];

  const byFactor = new Map<number, string>();
  for (const raw of input) {
    const name = typeof (raw as PackLevel)?.name === 'string' ? (raw as PackLevel).name.trim() : '';
    const factor = Number((raw as PackLevel)?.factor);
    if (!name || name.length > 20) continue;
    if (!Number.isInteger(factor) || factor <= 1) continue;
    // 同一 factor 只保留先出现的名字
    if (!byFactor.has(factor)) byFactor.set(factor, name);
  }

  return [...byFactor.entries()]
    .map(([factor, name]) => ({ name, factor }))
    .sort((a, b) => b.factor - a.factor)
    .slice(0, MAX_PACK_LEVELS);
}

/** 归一化后序列化成可入库的字符串；没有层级返回 null */
export function serializePackLevels(levels: PackLevel[]): string | null {
  return levels.length ? JSON.stringify(levels) : null;
}

/** 解析入库的 JSON 字符串；损坏/为空一律回退成空数组 */
export function parsePackLevels(raw: string | null | undefined): PackLevel[] {
  if (!raw) return [];
  try {
    return normalizePackLevels(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** 从一组包装 + 最小单位名，生成"可存储的对"（供 service 直接使用） */
export function normalizePackaging(
  baseUnit: string | null | undefined,
  levels: unknown,
): { baseUnit: string | null; packLevels: string | null } {
  const unit = baseUnit?.trim() || null;
  const normalized = normalizePackLevels(levels);
  return { baseUnit: unit, packLevels: serializePackLevels(normalized) };
}

/** 换算因子：按级别名取；level 为空/未知时按最小单位（1） */
export function factorOf(levelName: string | null | undefined, levels: PackLevel[]): number {
  if (!levelName) return 1;
  return levels.find((level) => level.name === levelName)?.factor ?? 1;
}

/** 把最小单位总数拆成各级 + 余数（最小单位） */
export function decompose(qty: number, levels: PackLevel[]): { parts: DecomposedPart[]; base: number } {
  let rest = Math.max(0, Math.floor(qty));
  const parts: DecomposedPart[] = [];
  for (const level of levels) {
    const count = Math.floor(rest / level.factor);
    if (count > 0) parts.push({ name: level.name, factor: level.factor, count });
    rest -= count * level.factor;
  }
  return { parts, base: rest };
}

/**
 * 展示用明细，如「1箱 1提 3瓶」。
 * 未启用包装（baseUnit 为空且无层级）时原样返回数字，保证老数据展示不变。
 */
export function formatBreakdown(
  qty: number,
  levels: PackLevel[],
  baseUnit: string | null | undefined,
): string {
  if (!baseUnit && levels.length === 0) return String(qty);

  const { parts, base } = decompose(qty, levels);
  const chunks = parts.map((part) => `${part.count}${part.name}`);
  if (base > 0 || chunks.length === 0) chunks.push(`${base}${baseUnit ?? ''}`);
  return chunks.join(' ');
}

/** 历史差异里用的可读串，如「箱=24, 提=6」 */
export function packLevelsLabel(levels: PackLevel[]): string | null {
  return levels.length ? levels.map((level) => `${level.name}=${level.factor}`).join(', ') : null;
}
