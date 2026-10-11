import {
  SCALAR_FIELDS,
  emptyFields,
  fieldsFromPayload,
  isLocked,
  type ItemFields,
} from './identity';
import { parseJson } from './json';

/**
 * 字段来源（provenance）：回答"这个值是谁报的、什么时候报的、有几个来源同意"。
 *
 * 这是收集器对外的核心卖点之一：公共资料库如果只能说"值是这个"，无法让人信任；
 * 能说"这个型号是实例 A 在 3 天前报的，另外 2 个实例报过同样的值"，
 * 使用者才知道该不该采信。所以详情接口与界面都把来源摆在明面上。
 *
 * 纯函数：输入当前字段值 + 历史上报，输出每个字段的来源，
 * 不查库、不依赖请求上下文，方便单测与复用（详情页、审计页都用它）。
 */

export interface ProvenanceContribution {
  id: number;
  instanceId: number | null;
  instanceName: string | null;
  source: string;
  observedAt: string;
  payload: string;
  blocked: boolean;
}

export interface FieldSource {
  field: string;
  value: string | null;
  /** 当前值的来源（最新一条给出非空值的未屏蔽上报） */
  contributionId: number | null;
  instanceId: number | null;
  instanceName: string | null;
  source: string | null;
  observedAt: string | null;
  /** 有多少条未屏蔽上报给出过**完全相同**的值 */
  agreedBy: number;
  /** 是否被人工锁定（锁定的字段不会再被自动改写） */
  locked: boolean;
}

/** 各字段的展示顺序：单值字段按定义顺序，然后是图片、扩展属性 */
function fieldOrder(field: string): number {
  const index = SCALAR_FIELDS.indexOf(field as (typeof SCALAR_FIELDS)[number]);
  if (index >= 0) return index;
  if (field === 'imageUrls') return SCALAR_FIELDS.length;
  return SCALAR_FIELDS.length + 1;
}

export function buildFieldSources(
  state: ItemFields,
  lockedFields: readonly string[],
  contributions: readonly ProvenanceContribution[],
): FieldSource[] {
  // 未屏蔽的上报，按观测时间从新到旧（时间相同时按 id 大的在前，与合并规则一致）
  const usable = contributions
    .filter((entry) => !entry.blocked)
    .map((entry) => ({ entry, fields: fieldsFromPayload(entry.payload) }))
    .sort((a, b) => {
      if (a.entry.observedAt !== b.entry.observedAt) {
        return a.entry.observedAt < b.entry.observedAt ? 1 : -1;
      }
      return b.entry.id - a.entry.id;
    });

  const scalarFields = SCALAR_FIELDS.map((field) => String(field));
  const attributeKeys = Object.keys(state.attributes ?? {}).sort();
  const fields = [...scalarFields, 'imageUrls', ...attributeKeys.map((key) => `attributes.${key}`)];

  const sources: FieldSource[] = [];
  for (const field of fields) {
    const currentValue = valueOf(state, field);
    const reports = usable
      .map(({ entry, fields: reported }) => ({ entry, value: valueOf(reported, field) }))
      .filter((item) => item.value !== null && item.value !== '');
    const locked = isLocked(lockedFields, field);

    if (currentValue === null && reports.length === 0 && !locked) continue;

    const best = reports.find((item) => item.value === currentValue) ?? reports[0];
    const agreedBy = reports.filter((item) => item.value === currentValue).length;

    sources.push({
      field,
      value: currentValue,
      contributionId: best?.entry.id ?? null,
      instanceId: best?.entry.instanceId ?? null,
      instanceName: best?.entry.instanceName ?? null,
      source: best?.entry.source ?? null,
      observedAt: best?.entry.observedAt ?? null,
      agreedBy,
      locked,
    });
  }

  return sources.sort((a, b) => fieldOrder(a.field) - fieldOrder(b.field));
}

/** 取字段的字符串形式（图片是逗号连接，属性按 `attributes.foo` 取） */
function valueOf(state: ItemFields, field: string): string | null {
  if (field === 'imageUrls') {
    const images = state.imageUrls ?? [];
    return images.length === 0 ? null : images.join(',');
  }
  if (field.startsWith('attributes.')) {
    const key = field.slice('attributes.'.length);
    return (state.attributes ?? {})[key] ?? null;
  }
  const value = (state as Record<string, unknown>)[field];
  return typeof value === 'string' && value !== '' ? value : null;
}

/** 重算时用：把上报按时间正序回放所需的起点 */
export function rewindState(fields: ItemFields): ItemFields {
  return fields ?? emptyFields();
}

/** 上报 payload 里的字段名（审计日志展示用） */
export function payloadFields(payload: string): string[] {
  const raw = parseJson<Record<string, unknown>>(payload, {});
  return Object.keys(raw).sort();
}
