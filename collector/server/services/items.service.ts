import type { EntityManager } from 'typeorm';
import type { CatalogItemRow, ContributionRow } from '../database/entities';
import {
  emptyFields,
  fieldsFromPayload,
  mergeItemFields,
  normalizeBarcode,
  normalizeFields,
  type ItemFields,
} from '../utils/identity';
import { parseJson, stringifyJson } from '../utils/json';
import { normalizePaging } from '../utils/pagination';
import {
  buildFieldSources,
  type FieldSource,
  type ProvenanceContribution,
} from '../utils/provenance';
import { badRequest, conflict, notFound } from '../utils/http';
import { contributionsRepo, instancesRepo, itemsRepo } from './repositories';

export interface ItemSummaryView {
  id: number;
  barcode: string | null;
  name: string | null;
  model: string | null;
  manufacturer: string | null;
  category: string | null;
  baseUnit: string | null;
  imageUrls: string[];
  contributionCount: number;
  instanceCount: number;
  updatedAt: string;
}

export interface ItemDetailView extends ItemSummaryView {
  identityKey: string;
  description: string | null;
  attributes: Record<string, string>;
  lockedFields: string[];
  firstSeenAt: string;
  fields: FieldSource[];
}

export interface ContributionView {
  id: number;
  instanceId: number | null;
  instanceName: string | null;
  source: string;
  observedAt: string;
  appliedFields: string[];
  payload: ItemFields;
  createdAt: string;
}

/**
 * 物品资料的读侧（公开查询）与重算（纠错用）。
 *
 * 一条铁律：**CatalogItem 里的字段值永远是从 Contribution 重放出来的结果**，
 * 只有 `recomputeItem()` 这一个写入点。人工改字段、屏蔽脏上报、合并重复物品、
 * 封禁实例，全部走"改 Contribution（或它的可见性）→ 重放"这条路，
 * 这样任何一次值变化都能追到"哪条上报造成的"，也不会出现字段与来源互相矛盾的状态。
 */
export class ItemsService {
  /** 按条码取物品；被合并过的条码会顺着 mergedIntoId 找到最终条目 */
  async findByBarcode(barcodeRaw: string): Promise<CatalogItemRow> {
    const barcode = normalizeBarcode(barcodeRaw);
    if (!barcode) {
      throw notFound('item.notFound', '条码为空');
    }
    const row = await itemsRepo().findOne({ where: { identityKey: `barcode:${barcode}` } });
    if (!row) {
      throw notFound('item.notFound', `没有条码为 ${barcode} 的物品`);
    }
    return this.followMerge(row);
  }

  /** 按 id 取物品（纠错台用，允许指向被合并条目以显示"已并入 X"） */
  async findById(id: number): Promise<CatalogItemRow> {
    const row = await itemsRepo().findOne({ where: { id } });
    if (!row) {
      throw notFound('item.notFound', `物品 ${id} 不存在`);
    }
    return row;
  }

  async requireById(id: number): Promise<CatalogItemRow> {
    return this.followMerge(await this.findById(id));
  }

  /** 在事务里沿着 mergedIntoId 找到最终条目（写入前必须调用，否则会上报进已被并掉的行） */
  async resolveMergeChain(manager: EntityManager, start: CatalogItemRow): Promise<CatalogItemRow> {
    let current = start;
    for (let hop = 0; hop < 8; hop += 1) {
      if (!current.mergedIntoId) return current;
      const next = await itemsRepo(manager).findOne({ where: { id: current.mergedIntoId } });
      if (!next) return current;
      current = next;
    }
    throw conflict('item.mergeLoop', '物品的合并链过深或成环，请检查纠错台里的合并记录');
  }

  private async followMerge(start: CatalogItemRow): Promise<CatalogItemRow> {
    let current = start;
    // 深度上限：正常合并不可能成环，但管理员手滑 + 手工改库都可能造出环。
    // 宁可报错也不要让一个请求把 CPU 转死。
    for (let hop = 0; hop < 8; hop += 1) {
      if (!current.mergedIntoId) return current;
      const next = await itemsRepo().findOne({ where: { id: current.mergedIntoId } });
      if (!next) return current;
      current = next;
    }
    throw conflict('item.mergeLoop', '物品的合并链过深或成环，请检查纠错台里的合并记录');
  }

  async search(query: { q?: string; page?: number; pageSize?: number }): Promise<{
    items: ItemSummaryView[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { page, pageSize, skip, take } = normalizePaging(query);
    const qb = itemsRepo()
      .createQueryBuilder('i')
      // 被并掉的条目在公开面上必须消失（纠错台仍能看到，那是 AdminService.items）。
      .where('i.mergedIntoId IS NULL');

    const needle = typeof query.q === 'string' ? query.q.trim().toLowerCase() : '';
    if (needle) {
      const { sql, params } = searchClause('i', needle);
      qb.andWhere(sql, params);
    }

    const [rows, total] = await qb
      .orderBy('i.updatedAt', 'DESC')
      .addOrderBy('i.id', 'DESC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return { items: rows.map((row) => this.toSummary(row)), total, page, pageSize };
  }

  /** 公开详情：字段值 + 每个字段的来源（谁在哪天报的、有没有被锁定） */
  async detail(item: CatalogItemRow): Promise<ItemDetailView> {
    const contributions = await this.visibleContributions(item.id);
    const names = await this.instanceNames(contributions.map((c) => c.instanceId));
    const provenance = this.toProvenance(contributions, names);
    const state = this.stateOf(item);
    const locked = parseJson<string[]>(item.lockedFields, []);
    return {
      ...this.toSummary(item),
      identityKey: item.identityKey,
      description: state.description ?? null,
      attributes: state.attributes ?? {},
      lockedFields: locked,
      firstSeenAt: item.firstSeenAt.toISOString(),
      fields: buildFieldSources(state, locked, provenance),
    };
  }

  /** 某物品的上报记录（公开：只列未被屏蔽、且来源实例未被封禁的） */
  async contributionsOf(
    item: CatalogItemRow,
    paging: { page?: number; pageSize?: number },
  ): Promise<{ contributions: ContributionView[]; total: number; page: number; pageSize: number }> {
    const { page, pageSize, skip, take } = normalizePaging(paging);
    const [rows, total] = await contributionsRepo()
      .createQueryBuilder('c')
      .where('c.catalogItemId = :itemId', { itemId: item.id })
      .andWhere('c.blocked = 0')
      .andWhere(this.notFromBlockedInstance('c'))
      .orderBy('c.observedAt', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .skip(skip)
      .take(take)
      .getManyAndCount();
    const names = await this.instanceNames(rows.map((r) => r.instanceId));
    return {
      contributions: rows.map((row) => this.toContributionView(row, names)),
      total,
      page,
      pageSize,
    };
  }

  /** 纠错台/重算用：参与竞争的显式集合（屏蔽的上报与封禁实例的上报都不算数） */
  async effectiveContributions(manager: EntityManager, itemId: number): Promise<ContributionRow[]> {
    return contributionsRepo(manager)
      .createQueryBuilder('c')
      .where('c.catalogItemId = :itemId', { itemId })
      .andWhere('c.blocked = 0')
      .andWhere(this.notFromBlockedInstance('c'))
      .orderBy('c.observedAt', 'ASC')
      .addOrderBy('c.id', 'ASC')
      .getMany();
  }

  /**
   * 从零重放某个物品的全部有效上报，得到当前字段值。
   *
   * 「从零重放」而不是「增量打补丁」是刻意的：屏蔽一条旧上报、把某个字段锁定、
   * 合并两个条目之后，正确的值取决于**剩下的**上报序列，而不是"在旧值上继续盖"。
   * 重放还有个附带好处：任何时刻都可以用同一条逻辑重建整库字段值。
   */
  async recomputeItem(itemId: number, manager?: EntityManager): Promise<CatalogItemRow> {
    const repo = itemsRepo(manager);
    const item = await repo.findOne({ where: { id: itemId } });
    if (!item) {
      throw notFound('item.notFound', `物品 ${itemId} 不存在`);
    }

    const locked = parseJson<string[]>(item.lockedFields, []);
    const contributions = await this.effectiveContributions(manager ?? this.fallbackManager(), itemId);

    let state = emptyFields();
    let fieldUpdatedAt: Record<string, string> = {};
    for (const contribution of contributions) {
      const isAdmin = contribution.source === 'admin';
      const incoming = fieldsFromPayload(contribution.payload);
      const merged = mergeItemFields(state, fieldUpdatedAt, incoming, {
        observedAt: contribution.observedAt ?? contribution.createdAt.toISOString(),
        // 锁定只拦自动上报：人工纠错必须能改自己锁过的字段，否则锁上就再也改不动了
        lockedFields: isAdmin ? [] : locked,
        // 人工纠错里"明确写了 null"的字段＝清空；自动上报里的 null 只是"这次没观测到"
        explicitNullFields: isAdmin ? nullFieldsOf(contribution.payload) : [],
      });
      state = merged.next;
      fieldUpdatedAt = merged.fieldUpdatedAt;
    }

    repo.merge(item, itemColumnsOf(state, fieldUpdatedAt));
    const saved = await repo.save(item);
    await this.refreshCounters(manager, itemId);
    return saved;
  }

  /** 计数列是展示用的缓存，每次写入/屏蔽后重算一遍（物品数量级下比维护增量便宜得多） */
  async refreshCounters(manager: EntityManager | undefined, itemId: number): Promise<void> {
    const repo = contributionsRepo(manager);
    const contributionCount = await repo
      .createQueryBuilder('c')
      .where('c.catalogItemId = :itemId', { itemId })
      .andWhere('c.blocked = 0')
      .andWhere(this.notFromBlockedInstance('c'))
      .getCount();
    const row = await repo
      .createQueryBuilder('c')
      .select('COUNT(DISTINCT c.instanceId)', 'n')
      .where('c.catalogItemId = :itemId', { itemId })
      .andWhere('c.blocked = 0')
      .andWhere('c.instanceId IS NOT NULL')
      .andWhere(this.notFromBlockedInstance('c'))
      .getRawOne<{ n: number | string }>();
    await itemsRepo(manager).update(
      { id: itemId },
      { contributionCount, instanceCount: Number(row?.n ?? 0) },
    );
  }

  /** 把条目状态写回列（供 ContributionsService 在事务里直接复用） */
  async persistState(
    manager: EntityManager,
    item: CatalogItemRow,
    state: ItemFields,
    fieldUpdatedAt: Record<string, string>,
  ): Promise<CatalogItemRow> {
    const repo = itemsRepo(manager);
    repo.merge(item, itemColumnsOf(state, fieldUpdatedAt));
    return repo.save(item);
  }

  /** 公开视图里"算数"的上报（详情页的来源列表用它） */
  async visibleContributions(itemId: number): Promise<ContributionRow[]> {
    return contributionsRepo()
      .createQueryBuilder('c')
      .where('c.catalogItemId = :itemId', { itemId })
      .andWhere('c.blocked = 0')
      .andWhere(this.notFromBlockedInstance('c'))
      .orderBy('c.observedAt', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .getMany();
  }

  async instanceNames(ids: Array<number | null>): Promise<Map<number, string>> {
    const unique = [...new Set(ids.filter((id): id is number => typeof id === 'number'))];
    if (unique.length === 0) return new Map();
    const rows = await instancesRepo()
      .createQueryBuilder('i')
      .select(['i.id AS id', 'i.name AS name'])
      .where('i.id IN (:...ids)', { ids: unique })
      .getRawMany<{ id: number; name: string }>();
    return new Map(rows.map((row) => [Number(row.id), row.name]));
  }

  /** 视图用的来源记录：把实例名与 ISO 时间补进 provenance 需要的形状 */
  toProvenance(rows: ContributionRow[], names: Map<number, string>): ProvenanceContribution[] {
    return rows.map((row) => ({
      id: row.id,
      instanceId: row.instanceId,
      instanceName: row.instanceId ? (names.get(row.instanceId) ?? null) : null,
      source: row.source,
      observedAt: row.observedAt ?? row.createdAt.toISOString(),
      payload: row.payload,
      blocked: row.blocked,
    }));
  }

  toSummary(item: CatalogItemRow): ItemSummaryView {
    return {
      id: item.id,
      barcode: item.barcode,
      name: item.name,
      model: item.model,
      manufacturer: item.manufacturer,
      category: item.category,
      baseUnit: item.baseUnit,
      imageUrls: parseJson<string[]>(item.imageUrls, []),
      contributionCount: item.contributionCount,
      instanceCount: item.instanceCount,
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  stateOf(item: CatalogItemRow): ItemFields {
    return normalizeFields({
      name: item.name,
      description: item.description,
      model: item.model,
      manufacturer: item.manufacturer,
      category: item.category,
      baseUnit: item.baseUnit,
      imageUrls: parseJson<string[]>(item.imageUrls, []),
      attributes: parseJson<Record<string, string>>(item.attributes, {}),
    });
  }

  toContributionView(row: ContributionRow, names: Map<number, string>): ContributionView {
    return {
      id: row.id,
      instanceId: row.instanceId,
      instanceName: row.instanceId ? (names.get(row.instanceId) ?? null) : null,
      source: row.source,
      observedAt: row.observedAt ?? row.createdAt.toISOString(),
      appliedFields: parseJson<string[]>(row.appliedFields, []),
      payload: fieldsFromPayload(row.payload),
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * 排除「来源实例已被封禁」的上报。
   * 子查询直接写 SQL（而不是 join）是因为它要出现在 count / 列表 / 重放三种查询里，
   * 而三种查询的 select 与分组都不一样，子查询是唯一不用改三处写法的形态。
   */
  private notFromBlockedInstance(alias: string): string {
    return `(${alias}.instanceId IS NULL OR ${alias}.instanceId NOT IN (SELECT id FROM CollectorInstance WHERE blocked = 1))`;
  }

  /** 有些内部调用（recomputeItem 未显式传 manager 时）需要一个默认 manager */
  private fallbackManager(): EntityManager {
    return itemsRepo().manager;
  }
}

/** 重放结果 → CatalogItem 的列（recompute/persist 两处共用） */
export function itemColumnsOf(
  state: ItemFields,
  fieldUpdatedAt: Record<string, string>,
): Partial<CatalogItemRow> {
  return {
    name: state.name ?? null,
    description: state.description ?? null,
    model: state.model ?? null,
    manufacturer: state.manufacturer ?? null,
    category: state.category ?? null,
    baseUnit: state.baseUnit ?? null,
    imageUrls: stringifyJson(state.imageUrls),
    attributes: stringifyJson(state.attributes),
    fieldUpdatedAt: stringifyJson(fieldUpdatedAt),
  };
}

/** 上报 payload 里"明确写了 null"的字段名（人工纠错的清空语义要用它来判断） */
export function nullFieldsOf(payload: string): string[] {
  const raw = parseJson<Record<string, unknown>>(payload, {});
  return Object.keys(raw).filter((field) => raw[field] === null);
}

/** 公开/管理端搜索共同匹配的列（迁移前是 LOWER(列) LIKE '%q%'） */
export const SEARCH_FIELDS = ['barcode', 'name', 'model', 'manufacturer', 'category'] as const;

/**
 * 搜索模式：先按原样，再把"去掉分隔符"的形态也匹配一次。
 *
 * 实例端常把条码按可读格式写成 `690-1234 567892`，而库里存的是归一化后的纯数字，
 * 否则用户粘进来的条码搜不到。调用方需保证 needle 已转小写（SQL 侧统一 LOWER()）。
 */
export function searchPatterns(needle: string): string[] {
  const compact = needle.replace(/[\s\u200b\u00a0-]+/g, '');
  return compact !== needle && compact !== '' ? [needle, compact] : [needle];
}

/**
 * 关键词搜索的 SQL 片段（含 LIKE 通配符与绑定参数），公开列表和纠错台共用一份。
 * 通配符只在这里加一次 —— 少加一次就会变成"全等匹配、永远搜不到"。
 */
export function searchClause(alias: string, needle: string): { sql: string; params: Record<string, string> } {
  const clauses: string[] = [];
  const params: Record<string, string> = {};
  searchPatterns(needle).forEach((pattern, index) => {
    params[`q${index}`] = `%${pattern}%`;
    for (const field of SEARCH_FIELDS) {
      clauses.push(`LOWER(${alias}.${field}) LIKE :q${index}`);
    }
  });
  return { sql: `(${clauses.join(' OR ')})`, params };
}
