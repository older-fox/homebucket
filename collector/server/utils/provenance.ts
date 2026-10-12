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

/** 一个字段的裁决结论（由服务层算好注入，见 buildFieldSources 第 4 个参数） */
export interface FieldDecision {
  value: string;
  decided: boolean;
  weight: number;
  count: number;
  totalWeight: number;
  /** 投给胜出值的来源键（见 utils/source.ts）：界面上回答"这个值是谁报的" */
  sources: string[];
  tally: Array<{ value: string; weight: number; count: number }>;
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
  /**
   * 该字段是否由**投票**决定的（false 表示回落到"最新非空观测"）。
   * 之所以需要这个标志：有人锁定字段、或该字段还没有实例证据（只有匿名上报）时，
   * 下发值与投票无关，界面不该显示"票数最高"。
   */
  voted?: boolean;
  /**
   * 本次下发是**最高票**（true）还是**票数并列/全 0 票时随机抽中**（false）。
   * 使用者有权知道这次下发的确定性有多强 —— 把"随机抽的"说成"大家都同意"，
   * 就是在用界面的自信掩盖数据的薄弱。
   */
  decided?: boolean;
  /** 参与投票的候选值数量（并列时能看出"其实有几个值在争"） */
  candidates?: number;
  /** 投给当前值的权重之和（票权，参与过反馈加权的来源权重更高） */
  voteWeight?: number;
  /** 投给当前值的**来源**数（同一来源反复报同一个值只算一票） */
  voteCount?: number;
  /** 投给当前值的来源键（可展开查看"到底是谁投的"） */
  voteSources?: string[];
  /** 全部候选的权重之和，用来显示"这个值占了多少票权" */
  totalWeight?: number;
  /** 各候选值的票数分布（按权重降序），供界面解释"为什么是它" */
  tally?: Array<{ value: string; weight: number; count: number }>;
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
  /**
   * 可选的**投票裁决**：`field → 该字段最终下发的值 + 决定过程`。
   *
   * 为什么把它做成"注入"而不是在函数里查库：这一层要保持纯函数（单测与重放都靠它）。
   * 投票需要实例权重、被封禁实例、证据行，那些都在服务层的数据库里；
   * 由调用方（ItemsService）查好、只把结论传进来，职责就分干净了。
   * 不传时行为与改造前完全一致（最新非空观测胜出）—— 兼容旧调用点与旧测试。
   */
  decisions?: ReadonlyMap<string, FieldDecision>,
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
    const locked = isLocked(lockedFields, field);
    const decision = decisions?.get(field);
    // 投票决定的值优先；被锁定的字段、以及没有任何实例证据的字段没有 decision，
    // 于是回落到物化状态里的当前值（原行为）
    const currentValue = decision?.value ?? valueOf(state, field);
    const reports = usable
      .map(({ entry, fields: reported }) => ({ entry, value: valueOf(reported, field) }))
      .filter((item) => item.value !== null && item.value !== '');

    if (currentValue === null && reports.length === 0 && !locked) continue;

    // 来源说明要指向**真正报出这个值的**那条上报：投票可能选出一个较早的观测，
    // 若继续用 `reports[0]`（最新一条）就会把"这个值是谁报的"指向别人，属于错报来源
    const best =
      reports.find((item) => item.value === currentValue) ??
      reports[0];
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
      ...(decision === undefined
        ? {}
        : {
            voted: true,
            decided: decision.decided,
            candidates: decision.tally.length,
            voteWeight: decision.weight,
            voteCount: decision.count,
            voteSources: decision.sources,
            totalWeight: decision.totalWeight,
            tally: decision.tally,
          }),
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
