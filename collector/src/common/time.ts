/**
 * 时间工具：库里所有业务时间都是 **ISO-8601 UTC 字符串**（原因见 entities 的注释）。
 * 统一从这里生成，保证格式一致、字典序等于时间序。
 */

/** 当前时间（ISO-8601，毫秒精度） */
export function isoNow(): string {
  return new Date().toISOString();
}

/** Date / 字符串 / 数字 → ISO 字符串；读不懂返回 null */
export function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? new Date(value).toISOString() : null;
  }
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (raw === '') return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/**
 * 归一化上报方给的时间。
 * 读不懂就返回 null —— 一个乱时间不应该让整条上报失败，
 * 只是这条观测失去"时间优势"，合并时会输给已有数据（见 identity.ts）。
 */
export function normalizeObservedAt(value: unknown): string | null {
  return toIso(value);
}

/** 距今多少天（分析用；向上取整到整天） */
export function daysAgoIso(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
