/**
 * JSON 列的读写工具。
 *
 * 库里的 JSON 列（imageUrls / attributes / fieldUpdatedAt / lockedFields / payload）
 * 装的都是外部上报的原始资料，绝不能因为某一行是老版本或外部写坏的 JSON，
 * 就让整个查询接口 500。所以读取一律走 parseJson：坏数据当作"没有"，不抛错。
 */
export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw === null || raw === undefined || raw === '') return fallback;
  try {
    const value = JSON.parse(raw) as T;
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

/** 写 JSON 列：空对象/空数组/null 一律写 NULL，避免库里出现 "{}" 这种没信息量的行 */
export function stringifyJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  if (typeof value === 'object' && Object.keys(value as Record<string, unknown>).length === 0) {
    return null;
  }
  return JSON.stringify(value);
}
