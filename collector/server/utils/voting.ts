import { createHash } from 'node:crypto';
import { normalizeText } from './identity';

/**
 * 分源暂存与投票：把"多个实例分别说了什么"变成"这次下发哪一个值"。
 *
 * ── 为什么要投票，而不是继续"最新覆盖" ──
 * 收集器的资料是各家实例各报一份的公共数据。旧规则是"最新非空观测胜出"：
 * 谁最后上报谁说了算 —— 这既压不住"某台实例一直报错值、还总在别人的报之后再报一次"，
 * 也利用不上"另外 5 台实例都报的是另一个值"这个极强信号。
 * 改成投票以后：
 *   · 每个**来源**对每个字段各持一票（同一个值反复报只算一票，见 observationHash 唯一约束）；
 *   · 票权 = 该来源的权重（由用户反馈累积，见 feedback.service）；投票能体现"谁的反馈好"；
 *   · **没有最高票时按权重随机下发**，让各来源都有机会被下发、从而有机会被反馈评价 ——
 *     否则冷门来源永远拿不到反馈、权重永远长不起来（这正是"根据反馈不断优化"的前提）。
 *
 * 纯函数集合：不查库、不依赖请求上下文，随机源由调用方注入（可测）。
 */

/** 一条证据（某来源对某字段某值的一票） */
export interface VoteCandidate {
  /** 归一化后的值；多值字段（imageUrls）是排好序的展示串 */
  value: string;
  /** 报出这个值的**来源键**（见 utils/source.ts）；null = 认不出来源，不参与投票 */
  sourceKey: string | null;
  /** 报出这个值的实例 id（可空，仅展示用；真实流量里恒为 null，因为上报全匿名） */
  instanceId: number | null;
  /** 该来源当前权重（>0） */
  weight: number;
  /** 最早把它报出来的时间（展示与并列时的稳定排序用） */
  observedAt: string;
  /** 支持这个值的证据条数（同实例同值已归一成一条，所以它就是票数） */
  count: number;
}

/** 合并后的一组票：一个值 + 支持它的来源 + 总权重 */
export interface VoteTally {
  value: string;
  /** 支持这个值的来源（去重） */
  sourceKeys: string[];
  /** 支持这个值的已注册实例（去重，可空，仅展示用） */
  instanceIds: number[];
  /** 证据条数（= 支持来源数，同一来源同值只算一条） */
  count: number;
  /** 权重和：投给这个值的全部实例权重之和 */
  weight: number;
  /** 最早被报出来的时间（全部支持者里最早的） */
  firstSeenAt: string;
}

export interface VoteResult {
  winner: VoteTally | null;
  tallies: VoteTally[];
  /** true = 有唯一最高票，直接下发它；false = 并列或全 0 票，按权重随机 */
  decided: boolean;
  /** 全部候选的总权重（加权随机用；为 0 时退化成均匀随机） */
  totalWeight: number;
}

/**
 * 计票。
 *
 * 比较用的是**权重和**而不是票数：这是"反馈加权"真正生效的地方 ——
 * 被用户判定为准确的来源，权重会上浮，它报的值更容易成为最高票。
 * 权重和为 0（全部权重都是 0，理论上不会发生，权重有下限）时退化成比票数，
 * 免得"全 0 票"把唯一有证据的值也判成未决。
 */
export function tallyVotes(candidates: readonly VoteCandidate[]): VoteResult {
  const byValue = new Map<string, VoteTally>();
  for (const candidate of candidates) {
    if (candidate.value === '') continue;
    const existing = byValue.get(candidate.value);
    if (existing) {
      existing.count += candidate.count;
      existing.weight += candidate.weight;
      if (candidate.sourceKey !== null && !existing.sourceKeys.includes(candidate.sourceKey)) {
        existing.sourceKeys.push(candidate.sourceKey);
      }
      if (candidate.instanceId !== null && !existing.instanceIds.includes(candidate.instanceId)) {
        existing.instanceIds.push(candidate.instanceId);
      }
      if (candidate.observedAt !== '' && candidate.observedAt < existing.firstSeenAt) {
        existing.firstSeenAt = candidate.observedAt;
      }
      continue;
    }
    byValue.set(candidate.value, {
      value: candidate.value,
      sourceKeys: candidate.sourceKey === null ? [] : [candidate.sourceKey],
      instanceIds: candidate.instanceId === null ? [] : [candidate.instanceId],
      count: candidate.count,
      weight: candidate.weight,
      firstSeenAt: candidate.observedAt,
    });
  }

  // 排序：权重降序 → 票数降序 → 谁先报出来（早的在前）→ 值本身。
  // 最后两级保证同一个数据集每次算出的顺序完全一致：并列时的随机选择要复现，
  // 就必须先有一个确定的顺序（否则"随机"会随查询计划变化）。
  const tallies = [...byValue.values()].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    if (b.count !== a.count) return b.count - a.count;
    if (a.firstSeenAt !== b.firstSeenAt) return a.firstSeenAt < b.firstSeenAt ? -1 : 1;
    return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
  });

  const totalWeight = tallies.reduce((sum, tally) => sum + Math.max(tally.weight, 0), 0);
  const [first, second] = tallies;
  const decided =
    first !== undefined &&
    (second === undefined ||
      (first.weight > second.weight || (first.weight === second.weight && first.count > second.count)));

  return { winner: first ?? null, tallies, decided, totalWeight };
}

/** 随机源：默认 Math.random，测试里注入确定性实现 */
export type RandomSource = () => number;

/**
 * 未决（并列/全 0 票）时按权重随机选一个。
 *
 * 实现是标准的加权前缀和抽样：把 [0, totalWeight) 划成一串按权重分配长度的区间，
 * 掷一个点看落在谁的区间里。
 *  · totalWeight <= 0（极端情况：候选权重全为 0）→ 退化成均匀随机，
 *    至少保证"被上报的信息会被随机下发"，而不是一个都发不出去；
 *  · random() 返回 1（理论上不该有，但注入的随机源可能给）→ 夹到最后一个，
 *    避免 roll 落到区间外返回 undefined。
 */
export function pickWeighted(tallies: readonly VoteTally[], random: RandomSource): VoteTally | null {
  if (tallies.length === 0) return null;
  const weights = tallies.map((tally) => Math.max(tally.weight, 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    const index = Math.min(Math.floor(random() * tallies.length), tallies.length - 1);
    return tallies[Math.max(index, 0)] ?? null;
  }
  let roll = random() * total;
  for (let index = 0; index < tallies.length; index += 1) {
    roll -= weights[index] ?? 0;
    if (roll < 0) return tallies[index] ?? null;
  }
  return tallies[tallies.length - 1] ?? null;
}

/**
 * 决定下发哪个值：有唯一最高票就用它，否则按权重随机。
 *
 * 这个函数就是需求里"若无最高投票，则随机下发被上报的信息"的落点。
 * 返回值里带上 `decided` 与 `tallies` 是为了让上层能如实说明
 * "这是最高票" 还是 "票数打平，随机选了一个" —— 使用者有权知道下发的确定性有多强。
 */
export function decideValue(
  candidates: readonly VoteCandidate[],
  random: RandomSource = Math.random,
): {
  value: string | null;
  decided: boolean;
  winner: VoteTally | null;
  tallies: VoteTally[];
} {
  const result = tallyVotes(candidates);
  if (result.winner === null) {
    return { value: null, decided: false, winner: null, tallies: [] };
  }
  const chosen = result.decided ? result.winner : pickWeighted(result.tallies, random);
  return {
    value: chosen?.value ?? null,
    decided: result.decided,
    winner: chosen,
    tallies: result.tallies,
  };
}

/**
 * 证据的幂等键：物品 + **来源** + 字段 + 值的 sha256。
 *
 * ── 为什么 owner 是来源键而不是实例 ID ──
 * 上报全是匿名的，`instanceId` 恒为 null，用它当 owner 等于所有上报共用一个键 ——
 * 不同来源报同一个值时会被 `orIgnore()` 挤成一行，投票就永远只有一票。
 * 来源键（`r:<hash>` / `f:<hash>`，见 utils/source.ts）才是真正的去重单位。
 *
 * `sourceKey` 为 null（认不出来源）时退回用贡献 id 区分，
 * 这样纯审计的匿名证据不会互相覆盖，也不会被当成同一个来源投票（那种行不参与计票）。
 */
export function observationHashOf(
  catalogItemId: number,
  sourceKey: string | null,
  field: string,
  value: string,
  contributionId: number | null = null,
): string {
  const owner = sourceKey === null ? `anon:${contributionId ?? 0}` : `s:${sourceKey}`;
  return createHash('sha256')
    .update(`${catalogItemId}\u0001${owner}\u0001${field}\u0001${value}`)
    .digest('hex');
}

/** 多值字段（图片）在证据行里的编码：值里可能含换行，所以用 JSON 数组串存 */
export function encodeObservationValue(field: string, values: string[]): string {
  return field === 'imageUrls' ? JSON.stringify(values) : (values[0] ?? '');
}

/** 把证据行里的值解码回可展示/可比较的形式 */
export function decodeObservationValue(field: string, raw: string): string[] {
  if (field !== 'imageUrls') return [raw];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    // 坏数据（手工改库/老版本写的）按单值处理，不要让一条脏记录打断整次下发
  }
  return [raw];
}

/**
 * 观察值归一化：投票必须按"归一化后的值"比较，否则
 * "Battery  4.0Ah" 与 "Battery 4.0Ah" 会被当成两个不同的值而各占一票。
 * 复用 identity.normalizeText（trim + 内部空白压缩 + 截断），保持一致。
 */
export function normalizeObservationValue(field: string, raw: unknown): string | null {
  if (Array.isArray(raw)) {
    const list = raw.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
    if (list.length === 0) return null;
    return field === 'imageUrls' ? JSON.stringify([...new Set(list)]) : (list[0] ?? null);
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  if (typeof raw !== 'string') return null;
  return normalizeText(raw, 500);
}
