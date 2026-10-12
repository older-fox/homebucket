import type { DataSource } from 'typeorm';
import { getDataSource } from '../database/db';
import { env } from '../utils/env';
import { notFound } from '../utils/http';
import { normalizePaging } from '../utils/pagination';
import { feedbackRepo, observationsRepo, weightsRepo } from './repositories';

export interface SourceView {
  /** 来源键（`r:…` 自报 / `f:…` 指纹）；权重与反馈都挂在它上面 */
  sourceKey: string;
  kind: string | null;
  /** 展示名：`自报 xxxxxxxx` 或 `IP 1.2.x.x` */
  label: string | null;
  /** 当前权重（投票时用这个，不是证据行里的快照） */
  weight: number;
  upvotes: number;
  downvotes: number;
  lastFeedbackAt: string | null;
  /** 这个来源报过多少条证据 */
  observations: number;
  /** 覆盖多少个物品 */
  items: number;
  /** 最近一次上报时间（没有证据行为 null） */
  lastObservedAt: string | null;
  /** 这个来源键后面出现过几个不同的 IP 哈希（>1 说明可能是共用出口） */
  ipHashes: number;
  userAgent: string | null;
}

export interface SourceDetailView extends SourceView {
  /** 最近的上报证据（新→旧），供管理员核对"它到底报了什么" */
  recent: Array<{
    id: number;
    catalogItemId: number;
    itemName: string | null;
    barcode: string | null;
    field: string;
    value: string;
    observedAt: string;
    /** 权重快照（当时这一票值多少），与实时 weight 刻意分开 */
    weightAtObservation: number;
  }>;
  /** 收到的反馈（新→旧） */
  feedback: Array<{
    id: number;
    catalogItemId: number;
    itemName: string | null;
    field: string;
    value: string | null;
    accurate: boolean;
    note: string | null;
    createdAt: string;
  }>;
}

export interface SourceListQuery {
  page?: number;
  pageSize?: number;
  /** 只看权重低于初始值的（"可疑来源"） */
  suspicious?: boolean;
}

/**
 * 「来源」视图：把一个来源键的全部痕迹摊开给管理员看。
 *
 * ── 为什么需要这个页面 ──
 * 改按来源投票之后，权重与反馈的主体不再是 CollectorInstance（匿名流量压根没有实例行），
 * 而是来源键。管理员必须能回答三个问题，否则这套机制是个黑箱：
 *   · 这个 `r:…` / `f:…` 到底是谁？（展示名 + UA + IP 哈希个数）
 *   · 它凭什么权重大/小？（好评差评条数 + 反馈原文）
 *   · 它到底报了什么？（最近的证据行与所属物品）
 *
 * ── 为什么"IP 哈希个数"要单独显示 ──
 * 指纹来源可能被多个实例共用（同 NAT 出口 + 同版本客户端），也可能一个实例换 IP 后
 * 掉成两个来源。这两种情况都无法从单个来源键看出来，但**能**从这个计数看出来：
 * 一个键后面挂着 5 个不同 IP 哈希，基本可以肯定它不是一个实例。
 * 与其假装来源数就是实例数，不如把这个数摆出来让管理员自己判断。
 */
export class SourcesService {
  constructor(private readonly source: DataSource = getDataSource()) {}

  async list(query: SourceListQuery): Promise<{
    sources: SourceView[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { page, pageSize, skip } = normalizePaging(query);

    // 权重表是"被评价过/被封过"的来源全集；证据行里还有大量从未被评价过的来源，
    // 它们也参与投票（用初始权重），所以两边都要算进来。
    const weights = await weightsRepo().createQueryBuilder('w').getMany();
    const weightByKey = new Map(weights.map((row) => [String(row.sourceKey), row]));

    const stats = await observationsRepo()
      .createQueryBuilder('o')
      .select('o.sourceKey', 'sourceKey')
      .addSelect('COUNT(*)', 'observations')
      .addSelect('COUNT(DISTINCT o.catalogItemId)', 'items')
      .addSelect('MAX(o.observedAt)', 'lastObservedAt')
      .addSelect('MAX(o.sourceKind)', 'kind')
      .addSelect('MAX(o.sourceLabel)', 'label')
      .addSelect('MAX(o.userAgent)', 'userAgent')
      .addSelect('COUNT(DISTINCT o.sourceIpHash)', 'ipHashes')
      .where('o.sourceKey IS NOT NULL')
      .groupBy('o.sourceKey')
      .getRawMany<{
        sourceKey: string;
        observations: number | string;
        items: number | string;
        lastObservedAt: string | null;
        kind: string | null;
        label: string | null;
        userAgent: string | null;
        ipHashes: number | string;
      }>();

    const merged = new Map<string, SourceView>();
    const initial = env.feedback.initial;
    for (const row of stats) {
      const key = String(row.sourceKey);
      const weightRow = weightByKey.get(key);
      merged.set(key, {
        sourceKey: key,
        kind: row.kind,
        label: row.label,
        // 没有权重行 = 从没被评价过，用初始权重（与投票时的回落口径一致）
        weight: weightRow ? Number(weightRow.weight) : initial,
        upvotes: weightRow ? Number(weightRow.upvotes) : 0,
        downvotes: weightRow ? Number(weightRow.downvotes) : 0,
        lastFeedbackAt: weightRow?.lastFeedbackAt ?? null,
        observations: Number(row.observations),
        items: Number(row.items),
        lastObservedAt: row.lastObservedAt,
        ipHashes: Number(row.ipHashes),
        userAgent: row.userAgent,
      });
    }

    // 有反馈但证据已被全部屏蔽的来源：只存在于权重表里，也要列出来
    // （否则"封了它的上报之后，它就从界面上消失了"，管理员会以为它没了）
    for (const [key, weightRow] of weightByKey) {
      if (merged.has(key)) continue;
      merged.set(key, {
        sourceKey: key,
        kind: null,
        label: null,
        weight: Number(weightRow.weight),
        upvotes: Number(weightRow.upvotes),
        downvotes: Number(weightRow.downvotes),
        lastFeedbackAt: weightRow.lastFeedbackAt,
        observations: 0,
        items: 0,
        lastObservedAt: null,
        ipHashes: 0,
        userAgent: null,
      });
    }

    let all = [...merged.values()];
    if (query.suspicious) {
      all = all.filter((entry) => entry.weight < initial);
    }
    // 可疑的（权重最低）排前面：管理员进这个页面多半是为了找坏来源。
    // 权重相同时按证据条数降序 —— 影响面大的优先看。
    all.sort((a, b) => a.weight - b.weight || b.observations - a.observations);

    return {
      sources: all.slice(skip, skip + pageSize),
      total: all.length,
      page,
      pageSize,
    };
  }

  async detail(sourceKey: string): Promise<SourceDetailView> {
    const weightRow = await weightsRepo().findOne({ where: { sourceKey } });
    const stats = await observationsRepo()
      .createQueryBuilder('o')
      .select('COUNT(*)', 'observations')
      .addSelect('COUNT(DISTINCT o.catalogItemId)', 'items')
      .addSelect('MAX(o.observedAt)', 'lastObservedAt')
      .addSelect('MAX(o.sourceKind)', 'kind')
      .addSelect('MAX(o.sourceLabel)', 'label')
      .addSelect('MAX(o.userAgent)', 'userAgent')
      .addSelect('COUNT(DISTINCT o.sourceIpHash)', 'ipHashes')
      .where('o.sourceKey = :sourceKey', { sourceKey })
      .getRawOne<{
        observations: number | string;
        items: number | string;
        lastObservedAt: string | null;
        kind: string | null;
        label: string | null;
        userAgent: string | null;
        ipHashes: number | string;
      }>();

    const observations = Number(stats?.observations ?? 0);
    if (weightRow === null && observations === 0) {
      throw notFound('source.notFound', `没有这个来源：${sourceKey}`);
    }

    const recentRows = await observationsRepo()
      .createQueryBuilder('o')
      .leftJoin('CatalogItem', 'i', 'i.id = o.catalogItemId')
      .select([
        'o.id AS id',
        'o.catalogItemId AS catalogItemId',
        'i.name AS itemName',
        'i.barcode AS barcode',
        'o.field AS field',
        'o.value AS value',
        'o.observedAt AS observedAt',
        'o.weight AS weightAtObservation',
      ])
      .where('o.sourceKey = :sourceKey', { sourceKey })
      .orderBy('o.observedAt', 'DESC')
      .addOrderBy('o.id', 'DESC')
      .limit(100)
      .getRawMany<{
        id: number;
        catalogItemId: number;
        itemName: string | null;
        barcode: string | null;
        field: string;
        value: string;
        observedAt: string;
        weightAtObservation: number;
      }>();

    const feedbackRows = await feedbackRepo()
      .createQueryBuilder('f')
      .leftJoin('CatalogItem', 'i', 'i.id = f.catalogItemId')
      .select([
        'f.id AS id',
        'f.catalogItemId AS catalogItemId',
        'i.name AS itemName',
        'f.field AS field',
        'f.value AS value',
        'f.accurate AS accurate',
        'f.note AS note',
        'f.createdAt AS createdAt',
      ])
      .where('f.sourceKey = :sourceKey', { sourceKey })
      .orderBy('f.createdAt', 'DESC')
      .addOrderBy('f.id', 'DESC')
      .limit(100)
      .getRawMany<{
        id: number;
        catalogItemId: number;
        itemName: string | null;
        field: string;
        value: string | null;
        accurate: number | boolean;
        note: string | null;
        createdAt: Date | string;
      }>();

    return {
      sourceKey,
      kind: stats?.kind ?? null,
      label: stats?.label ?? null,
      weight: weightRow ? Number(weightRow.weight) : env.feedback.initial,
      upvotes: weightRow ? Number(weightRow.upvotes) : 0,
      downvotes: weightRow ? Number(weightRow.downvotes) : 0,
      lastFeedbackAt: weightRow?.lastFeedbackAt ?? null,
      observations,
      items: Number(stats?.items ?? 0),
      lastObservedAt: stats?.lastObservedAt ?? null,
      ipHashes: Number(stats?.ipHashes ?? 0),
      userAgent: stats?.userAgent ?? null,
      recent: recentRows.map((row) => ({
        id: Number(row.id),
        catalogItemId: Number(row.catalogItemId),
        itemName: row.itemName,
        barcode: row.barcode,
        field: row.field,
        value: row.value,
        observedAt: row.observedAt,
        weightAtObservation: Number(row.weightAtObservation),
      })),
      feedback: feedbackRows.map((row) => ({
        id: Number(row.id),
        catalogItemId: Number(row.catalogItemId),
        itemName: row.itemName,
        field: row.field,
        value: row.value,
        accurate: row.accurate === true || row.accurate === 1,
        note: row.note,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      })),
    };
  }

  /**
   * 人工设定一个来源的权重。
   *
   * 存在的意义是"救急"：自动权重要攒够反馈才动，而一个正在刷错数据的来源需要立刻压下去。
   * 手改之后 `upvotes`/`downvotes` **保持不变** —— 它们是反馈的统计事实，不该被手改值污染；
   * 代价是下一次有反馈进来时 `recompute` 会按反馈重算并覆盖这个手改值。
   * 这是刻意的：反馈是事实，人工干预是临时手段，不该永久盖过事实。
   */
  async setWeight(sourceKey: string, weight: number): Promise<SourceView> {
    const clamped = Math.min(Math.max(weight, env.feedback.min), env.feedback.max);
    const existing = await weightsRepo().findOne({ where: { sourceKey } });
    const row = existing ?? weightsRepo().create({ sourceKey });
    row.weight = clamped;
    await weightsRepo().save(row);
    return this.detail(sourceKey);
  }
}
