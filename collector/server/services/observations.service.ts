import type { EntityManager } from 'typeorm';
import { env } from '../utils/env';
import type { SourceIdentity } from '../utils/source';
import {
  encodeObservationValue,
  normalizeObservationValue,
  observationHashOf,
  pickWeighted,
  tallyVotes,
  type VoteCandidate,
  type VoteResult,
} from '../utils/voting';
import { SCALAR_FIELDS, type ItemFields } from '../utils/identity';
import type { FieldDecision } from '../utils/provenance';
import { badRequest } from '../utils/http';
import {
  feedbackRepo,
  observationsRepo,
  weightsRepo,
} from './repositories';

/** 一张证据入库时的输入（字段名 → 归一化后的值） */
export interface ObservationInput {
  field: string;
  value: string;
  observedAt: string;
  contributionId: number | null;
}

/**
 * 分源暂存：把一次上报里的每个字段拆成一行"证据"，并回答某字段该下发哪个值。
 *
 * 两个职责刻意放在同一个服务里：
 *  · 写侧 `record()` 由上报流程调用（与 Contribution 同一事务）；
 *  · 读侧 `decide()` / `tally()` 由下发与详情页调用。
 * 放在一起是因为它们共用同一套字段命名与值编码（`attributes.<key>`、图片的 JSON 串），
 * 分开写迟早会出现"写进去的值和读出来比的值不是一个形状"。
 */
export class ObservationsService {
  /**
   * 把一次上报拆成证据行。
   *
   * ── 两个刻意的取舍 ──
   *  1. **空值不入库**："这次没提这个字段"不是证据，也不该参与投票。
   *     人工纠错的"清空"语义由 admin 的 explicitNullFields 负责，不靠观测行表达。
   *  2. **同一来源同字段同值只留一行**（observationHash 唯一）：一个来源心跳式地重复
   *     上报同一个值，不应该把自己的票从 1 变成 100。冲突时走 `orIgnore()`
   *     （SQLite 的 INSERT OR IGNORE），既幂等又不用先查一遍。
   */
  async record(
    manager: EntityManager,
    input: {
      catalogItemId: number;
      /** 来源身份（投票身份）：见 utils/source.ts */
      source: SourceIdentity;
      /** 这条证据恰好来自哪个已注册实例（可空，仅展示；真实流量里恒为 null） */
      instanceId: number | null;
      fields: ItemFields;
      observedAt: string;
      contributionId: number | null;
      weight: number;
    },
  ): Promise<number> {
    const rows: Array<{
      field: string;
      value: string;
      hash: string;
    }> = [];

    for (const field of SCALAR_FIELDS) {
      const raw = input.fields[field];
      const value = normalizeObservationValue(String(field), raw);
      if (value === null) continue;
      rows.push({
        field: String(field),
        value,
        hash: observationHashOf(input.catalogItemId, input.source.key, String(field), value, input.contributionId),
      });
    }

    const attributeKeys = Object.keys(input.fields.attributes ?? {}).sort();
    for (const key of attributeKeys) {
      const field = `attributes.${key}`;
      const value = normalizeObservationValue(field, input.fields.attributes?.[key]);
      if (value === null) continue;
      rows.push({
        field,
        value,
        hash: observationHashOf(input.catalogItemId, input.source.key, field, value, input.contributionId),
      });
    }

    const images = input.fields.imageUrls ?? [];
    if (images.length > 0) {
      const ordered = [...new Set(images)].sort();
      const value = encodeObservationValue('imageUrls', ordered);
      rows.push({
        field: 'imageUrls',
        value,
        hash: observationHashOf(input.catalogItemId, input.source.key, 'imageUrls', value, input.contributionId),
      });
    }

    if (rows.length === 0) return 0;

    await observationsRepo(manager)
      .createQueryBuilder()
      .insert()
      // orIgnore：撞上 observationHash 唯一索引时静默跳过（就是"这票已经在箱子里了"）
      .orIgnore()
      .values(
        rows.map((row) => ({
          catalogItemId: input.catalogItemId,
          instanceId: input.instanceId,
          sourceKey: input.source.key,
          sourceKind: input.source.kind,
          sourceLabel: input.source.label,
          sourceIpHash: input.source.ipHash,
          field: row.field,
          value: row.value,
          observationHash: row.hash,
          observedAt: input.observedAt,
          contributionId: input.contributionId,
          weight: input.weight,
        })),
      )
      .execute();

    return rows.length;
  }

  /** 来源键是否允许投票（IP+UA 指纹可以按配置关掉，见 env.source.fingerprintVotes） */
  private static canVote(row: { sourceKey: string | null; sourceKind: string | null }): boolean {
    if (row.sourceKey === null) return false;
    if (row.sourceKind === 'fingerprint') return env.source.fingerprintVotes;
    return true;
  }

  /**
   * 某物品某字段的全部证据（屏蔽的上报、被封禁实例的证据都排除）。
   *
   * 参与计票的条件是**有来源键**（`sourceKey IS NOT NULL`），不是"有 instanceId"——
   * 上报全是匿名的，按 instanceId 过滤会让票箱永远是空的（改造前实测正是如此）。
   * 认不出来源的行（`kind = 'none'`）只入审计、不计票。
   */
  async candidates(itemId: number, field: string): Promise<VoteCandidate[]> {
    const rows = await observationsRepo()
      .createQueryBuilder('o')
      .leftJoin('Contribution', 'c', 'c.id = o.contributionId')
      .where('o.catalogItemId = :itemId', { itemId })
      .andWhere('o.field = :field', { field })
      // 没有来源键 = 认不出是谁报的：无身份就没有可被反馈的权重，不投票
      .andWhere('o.sourceKey IS NOT NULL')
      // 被屏蔽的上报带来的证据不算数
      .andWhere('(c.id IS NULL OR c.blocked = 0)')
      // 被封禁实例的证据不算数（老客户端报了实例名、管理员据此封禁的情况仍然有效）
      .andWhere(
        "(o.instanceId IS NULL OR o.instanceId NOT IN (SELECT id FROM CollectorInstance WHERE blocked = 1))",
      )
      .getMany();

    const voteable = rows.filter((row) => ObservationsService.canVote(row));
    const weights = await this.weightMap(voteable.map((row) => row.sourceKey));
    const grouped = new Map<string, VoteCandidate>();
    for (const row of voteable) {
      const sourceKey = row.sourceKey;
      if (sourceKey === null) continue;
      const weight = weights.get(sourceKey) ?? env.feedback.initial;
      const key = `${sourceKey}\u0000${row.value}`;
      const existing = grouped.get(key);
      if (existing) {
        // 同一来源同一个值有多条（不同时间上报过）：算一票，但要把最早时间留下
        existing.count += 1;
        if (row.observedAt < existing.observedAt) existing.observedAt = row.observedAt;
        continue;
      }
      grouped.set(key, {
        value: row.value,
        sourceKey,
        instanceId: row.instanceId,
        weight,
        observedAt: row.observedAt,
        count: 1,
      });
    }
    return [...grouped.values()];
  }

  /** 计票（给详情页/统计页展示用，不消耗随机源） */
  async tally(itemId: number, field: string): Promise<VoteResult> {
    return tallyVotes(await this.candidates(itemId, field));
  }

  /**
   * 决定某字段下发哪个值。
   *
   * 有唯一最高票 → 直接用它（`decided: true`）；
   * 票数/权重并列或全 0 票 → **按权重随机下发其中一个被上报的值**。
   * 返回 `decided=false` 让上层能如实说明"这次是随机选的"，而不是假装它是最优选。
   */
  async decide(
    itemId: number,
    field: string,
    random?: () => number,
  ): Promise<{
    value: string | null;
    decided: boolean;
    /** 各候选值的票数分布（精简形状：并发给客户端时不需要来源键） */
    tallies: Array<{ value: string; weight: number; count: number }>;
  }> {
    const decision = await this.decisionOf(itemId, field, random);
    if (decision === null) return { value: null, decided: false, tallies: [] };
    return { value: decision.value, decided: decision.decided, tallies: decision.tally };
  }

  /**
   * 单个字段的完整裁决（含票数分布），交给 `buildFieldSources` 展示与下发。
   *
   * 与 `decide` 的差别只在返回形状：`decide` 是给"我只要一个值"的调用方，
   * 这里是给"我要把过程讲清楚"的详情页 —— 两者共用同一段计票，不会出现
   * 展示说 A 最高票、实际下发却是 B 的错位。
   */
  async decisionOf(
    itemId: number,
    field: string,
    random: () => number = Math.random,
  ): Promise<FieldDecision | null> {
    const result = tallyVotes(await this.candidates(itemId, field));
    if (result.winner === null) return null;
    // 并列/全 0 票时按权重随机抽一个：这一步每次调用都会重新掷点，
    // 所以"同一次请求里取两次"必须复用同一个裁决（见 decisionsOf 的说明）
    const chosen = result.decided ? result.winner : pickWeighted(result.tallies, random);
    if (chosen === null) return null;
    return {
      value: chosen.value,
      decided: result.decided,
      weight: chosen.weight,
      count: chosen.count,
      totalWeight: result.totalWeight,
      sources: chosen.sourceKeys,
      tally: result.tallies.map((tally) => ({
        value: tally.value,
        weight: tally.weight,
        count: tally.count,
      })),
    };
  }

  /**
   * 一个物品多个字段的裁决表（`buildFieldSources` 的第 4 个参数）。
   *
   * 为什么要"一次算一批"而不是每个字段单独调 `decisionOf`：
   *  1. **未决字段的随机必须只掷一次**。若详情接口先算一次、出图/导出又算一次，
   *     同一个物品在同一个响应里可能名是 A 值、所属条目是 B 值 ——
   *     使用者看到的是自相矛盾的数据。这里把随机源定死一次，保证一致性。
   *  2. 少一轮"字段数 × 查询数"的往返（SQLite 下不致命，但不必要）。
   *
   * 随机源可注入，未决字段的抽取因此在单测里完全可复现。
   */
  async decisionsOf(
    itemId: number,
    fields: readonly string[],
    random: () => number = Math.random,
  ): Promise<Map<string, FieldDecision>> {
    const decisions = new Map<string, FieldDecision>();
    for (const field of fields) {
      const decision = await this.decisionOf(itemId, field, random);
      if (decision !== null) decisions.set(field, decision);
    }
    return decisions;
  }

  /** 来源权重表（缺失的来源回落初始权重） */
  async weightMap(sourceKeys: Array<string | null>): Promise<Map<string, number>> {
    const keys = [...new Set(sourceKeys.filter((key): key is string => typeof key === 'string'))];
    if (keys.length === 0) return new Map();
    const rows = await weightsRepo()
      .createQueryBuilder('w')
      .where('w.sourceKey IN (:...keys)', { keys })
      .getMany();
    return new Map(rows.map((row) => [String(row.sourceKey), Number(row.weight)]));
  }
}

/**
 * 反馈与权重：用户说"这条资料准/不准"之后，调整那个来源的权重。
 *
 * ── 权重怎么算 ──
 * 反馈是事实、权重是派生值：`weight = clamp(initial × up^upvotes ÷ down^downvotes)`。
 * 也就是说"两次准确 + 一次不准确"的来源权重是 `1×1.2²÷1.5 = 0.96`。
 * 之所以能这样算，是因为我们存了每一条反馈（ObservationFeedback），
 * 于是既能随时重算、也能解释"这个 0.96 是怎么来的"。
 *
 * ── 为什么要夹在 [min, max] ──
 * 不夹的话，一个来源靠 20 条好反馈能拿到 38 倍权重、彻底压死所有其他来源；
 * 一次误报就能把新来源打到 0.66。收集器的资料本来就靠"多来源互相纠正"，
 * 让单一来源有无限话语权与设计目标相反。
 *
 * ── 为什么按来源而不是按物品 ──
 * 权重是**跨物品全局**的（见 recompute 的说明）：反馈要回答"这个来源靠不靠谱"，
 * 而不是"它在这件商品上这次对不对"。
 */
export class FeedbackService {
  /**
   * 记录一条反馈并更新权重。
   *
   * 幂等：同一**来源**对同一物品同一字段**只算一次**（重复点不会反复加权）。
   * 重复点返回 `recorded: false`，让界面能提示"你已经评价过这条了"，
   * 而不是悄悄把它当成一次新的加权。
   *
   * ── 反馈"记在谁头上" ──
   * 记在被评价值所属的**来源键**上（`sourceKey`），不是 instanceId ——
   * 上报全是匿名的，instanceId 恒为 null，按它记等于全丢。评价方自己是谁则由
   * `reporterKey` 表示（去重用），两者刻意分开：同一个来源不能靠自己给自己刷好评，
   * 但"哪个来源说的"和"哪个来源评的"本来就是两个问题。
   */
  async submit(input: {
    itemId: number;
    field: string;
    value: string | null;
    accurate: boolean;
    observationId: number | null;
    /** 被评价值所属的来源键（不给则从证据反查） */
    sourceKey?: string | null;
    /** 反馈方自己的来源键（去重键） */
    reporterKey: string | null;
    reporterInstanceId: number | null;
    note: string | null;
  }): Promise<{
    recorded: boolean;
    sourceKey: string | null;
    weight: number | null;
    upvotes: number;
    downvotes: number;
  }> {
    const observation = await this.resolveObservation(input.itemId, input.field, input);
    // 来源键优先用调用方给的（下发时界面知道自己是哪一条），否则从证据行取
    const sourceKey = input.sourceKey ?? observation?.sourceKey ?? null;
    const observationInstanceId = observation?.instanceId ?? null;

    if (sourceKey === null) {
      // 认不出来源（管理员纠错值、或证据已被屏蔽）：只留反馈记录，不动权重
      await feedbackRepo().save({
        catalogItemId: input.itemId,
        observationId: observation?.id ?? null,
        instanceId: observationInstanceId,
        sourceKey: null,
        field: input.field,
        value: input.value,
        accurate: input.accurate,
        reporterInstanceId: input.reporterInstanceId,
        note: input.note,
        reporterKey: input.reporterKey,
      });
      return { recorded: true, sourceKey: null, weight: null, upvotes: 0, downvotes: 0 };
    }

    // 同一来源对同一物品同一字段只算一次：找已有的就更新那一票
    const existing = await feedbackRepo().findOne({
      where: { sourceKey, catalogItemId: input.itemId, field: input.field },
    });

    if (existing) {
      const sameVerdict = existing.accurate === input.accurate;
      // **必须把判断本身写回去**：漏掉这一行时"准确↔不准确"的改判只更新了备注与来源，
      // 库里仍是旧判断，随后 recompute 按旧判断统计 —— 表现为"改了评价但权重纹丝不动"。
      // 这正是集成测试里 accurate:false 仍返回 upvotes:1/downvotes:0 的原因。
      existing.accurate = input.accurate;
      existing.value = input.value ?? existing.value;
      existing.note = input.note ?? existing.note;
      existing.reporterInstanceId = input.reporterInstanceId ?? existing.reporterInstanceId;
      existing.reporterKey = input.reporterKey ?? existing.reporterKey;
      existing.observationId = observation?.id ?? existing.observationId;
      await feedbackRepo().save(existing);
      // 改了判断（准确 ↔ 不准确）才需要动权重；重复点同一个按钮不改变任何东西
      if (sameVerdict) {
        const current = await this.ensureWeight(sourceKey);
        return {
          recorded: false,
          sourceKey,
          weight: current.weight,
          upvotes: current.upvotes,
          downvotes: current.downvotes,
        };
      }
    } else {
      await feedbackRepo().save({
        catalogItemId: input.itemId,
        observationId: observation?.id ?? null,
        instanceId: observationInstanceId,
        sourceKey,
        field: input.field,
        value: input.value,
        accurate: input.accurate,
        reporterInstanceId: input.reporterInstanceId,
        note: input.note,
        reporterKey: input.reporterKey,
      });
    }

    // 权重不再"增量乘一次"，而是从反馈表重算 —— 因为这次可能是"改判"，
    // 增量法在改判时会把旧判断的效果留在权重里，永远纠不回来。
    return this.recompute([sourceKey]);
  }

  /**
   * 按全部反馈重算指定来源（不传则全部）的权重。
   *
   * 这是权重的**唯一写入路径**：增量修改一律走它，所以权重永远等于
   * "把反馈表从头算一遍"的结果，不会出现"数值飘了但没有记录能解释"的状态。
   *
   * 注意粒度是**全局的**（不按物品分）：一个来源在"A 商品"上被评准确多少次，
   * 就会在"B 商品"的投票里也更有分量。这是刻意的 ——
   * 反馈要回答的是"这个来源靠不靠谱"，而不是"它在这件商品上这次对不对"；
   * 按物品分权重的话，每件商品都要攒够反馈才有意义，冷启动永远起不来。
   */
  async recompute(sourceKeys?: string[]): Promise<{
    recorded: boolean;
    sourceKey: string | null;
    weight: number | null;
    upvotes: number;
    downvotes: number;
  }> {
    const repo = feedbackRepo();
    const rows = sourceKeys && sourceKeys.length > 0
      ? await repo
          .createQueryBuilder('f')
          .where('f.sourceKey IN (:...keys)', { keys: sourceKeys })
          .getMany()
      : await repo.createQueryBuilder('f').where('f.sourceKey IS NOT NULL').getMany();

    /** true = 全量重建（没有指定来源），false = 只重算指定的来源 */
    const full = !sourceKeys || sourceKeys.length === 0;

    const grouped = new Map<string, { up: number; down: number; last: string | null }>();
    for (const row of rows) {
      if (row.sourceKey === null) continue;
      const entry = grouped.get(row.sourceKey) ?? { up: 0, down: 0, last: null };
      if (row.accurate) entry.up += 1;
      else entry.down += 1;
      const stamp = row.createdAt.toISOString();
      if (entry.last === null || stamp > entry.last) entry.last = stamp;
      grouped.set(row.sourceKey, entry);
    }

    // 指定的来源即使没有任何反馈也要把权重写回初始值（"清空反馈后复位"要能生效）
    for (const key of sourceKeys ?? []) {
      if (!grouped.has(key)) grouped.set(key, { up: 0, down: 0, last: null });
    }

    let single: { sourceKey: string; weight: number; upvotes: number; downvotes: number } | null = null;
    const keys = [...grouped.keys()];
    if (keys.length > 0) {
      const existing = await weightsRepo()
        .createQueryBuilder('w')
        .where('w.sourceKey IN (:...keys)', { keys })
        .getMany();
      const byKey = new Map(existing.map((row) => [String(row.sourceKey), row]));
      for (const key of keys) {
        const entry = grouped.get(key) ?? { up: 0, down: 0, last: null };
        const weight = weightOf(entry.up, entry.down);
        const row = byKey.get(key) ?? weightsRepo().create({ sourceKey: key });
        row.weight = weight;
        row.upvotes = entry.up;
        row.downvotes = entry.down;
        row.lastFeedbackAt = entry.last;
        await weightsRepo().save(row);
        if (sourceKeys?.length === 1 && sourceKeys[0] === key) {
          single = { sourceKey: key, weight, upvotes: entry.up, downvotes: entry.down };
        }
      }
    }

    // 全量重建时把"反馈已被清空"的来源权重行删掉：权重是派生数据，
    // 留着零反馈的旧行会让「来源」界面显示一堆 1.0 的幽灵来源，
    // 也会让 later 的投票把"这个来源曾经被评价过"当成事实。
    // 只重算指定来源时**不能**这么做 —— 那种调用正是为了把某个来源复位成初始权重。
    if (full) {
      const stale = await weightsRepo().createQueryBuilder('w').getMany();
      const keep = new Set(keys);
      for (const row of stale) {
        if (!keep.has(String(row.sourceKey))) await weightsRepo().remove(row);
      }
    }

    if (single) {
      return { recorded: true, ...single };
    }
    return {
      recorded: true,
      sourceKey: sourceKeys?.[0] ?? null,
      weight: null,
      upvotes: 0,
      downvotes: 0,
    };
  }

  /** 权重行（没有就建一个初始权重的，保证展示与计算口径一致） */
  async ensureWeight(sourceKey: string): Promise<{ weight: number; upvotes: number; downvotes: number }> {
    const existing = await weightsRepo().findOne({ where: { sourceKey } });
    if (existing) {
      return {
        weight: Number(existing.weight),
        upvotes: Number(existing.upvotes),
        downvotes: Number(existing.downvotes),
      };
    }
    const created = weightsRepo().create({ sourceKey });
    const saved = await weightsRepo().save(created);
    return { weight: Number(saved.weight), upvotes: 0, downvotes: 0 };
  }

  /** 反馈对应的那条证据：优先按 observationId，其次按来源+字段+值反查最新一条 */
  private async resolveObservation(
    itemId: number,
    field: string,
    input: { observationId: number | null; value: string | null; sourceKey?: string | null },
  ) {
    const repo = observationsRepo();
    if (input.observationId !== null) {
      const row = await repo.findOne({ where: { id: input.observationId } });
      if (row && row.catalogItemId !== itemId) {
        throw badRequest('feedback.observationMismatch', '这条证据不属于该物品');
      }
      return row;
    }
    if (input.value === null) return null;
    const query = repo
      .createQueryBuilder('o')
      .where('o.catalogItemId = :itemId', { itemId })
      .andWhere('o.field = :field', { field })
      .andWhere('o.value = :value', { value: input.value })
      .andWhere('o.sourceKey IS NOT NULL')
      .orderBy('o.observedAt', 'DESC')
      .addOrderBy('o.id', 'DESC');
    if (input.sourceKey !== undefined && input.sourceKey !== null) {
      query.andWhere('o.sourceKey = :skey', { skey: input.sourceKey });
    }
    return query.getOne();
  }
}

/** 权重公式：初始值 × up^好评数 ÷ down^差评数，并夹在配置区间内 */
export function weightOf(upvotes: number, downvotes: number): number {
  const { initial, up, down, min, max } = env.feedback;
  const raw = (initial * Math.pow(up, Math.max(upvotes, 0))) / Math.pow(down, Math.max(downvotes, 0));
  if (!Number.isFinite(raw)) return initial;
  return Math.min(Math.max(raw, min), max);
}
