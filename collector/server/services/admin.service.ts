import type { DataSource, EntityManager } from 'typeorm';
import { getDataSource } from '../database/db';
import type { CatalogItemRow, ContributionRow } from '../database/entities';
import { env } from '../utils/env';
import { SCALAR_FIELDS, contentHashOf, normalizeFields, type ItemFields } from '../utils/identity';
import { parseJson } from '../utils/json';
import { badRequest, conflict, notFound } from '../utils/http';
import { isoNow } from '../utils/time';
import type {
  BlockContributionDto,
  BlockInstanceDto,
  PatchItemDto,
  QueryAdminContributionsDto,
  QueryAdminInstancesDto,
} from '../dto/admin';
import type { QueryItemsDto } from '../dto/items';
import { InstancesService, type InstanceView } from './instances.service';
import type { AdminUserView } from './auth.service';
import {
  ItemsService,
  searchClause,
  type ItemDetailView,
  type ItemSummaryView,
} from './items.service';
import { contributionsRepo, itemsRepo } from './repositories';
import { normalizePaging } from '../utils/pagination';

export interface AdminSessionView {
  ok: true;
  version: string;
  registrationOpen: boolean;
  scope: 'admin';
  /** 当前登录的账号（前端顶栏显示"以谁的身份在操作"） */
  user: AdminUserView;
  /**
   * 权重配置的当前值。
   *
   * 界面要显示"权重低于多少才算可疑"，而这个基准可配（`COLLECTOR_WEIGHT_INITIAL`）；
   * 写死 1 的话，管理员改了配置后界面会一直说"没有可疑来源"，而服务端正按别的值判。
   */
  feedback: { initial: number; min: number; max: number };
}

export interface AdminItemRow extends ItemSummaryView {
  lockedFields: string[];
  mergedIntoId: number | null;
}

export interface AdminItemDetailView extends ItemDetailView {
  mergedIntoId: number | null;
  contributions: AdminContributionView[];
}

export interface AdminContributionView {
  id: number;
  itemId: number;
  itemBarcode: string | null;
  itemName: string | null;
  instanceId: number | null;
  instanceName: string | null;
  source: string;
  observedAt: string;
  appliedFields: string[];
  payload: ItemFields;
  blocked: boolean;
  blockedReason: string | null;
  blockedAt: string | null;
  createdAt: string;
}

/** 最近展示多少条上报：纠错台详情页只需要"最近发生了什么"，全量有分页接口 */
const DETAIL_CONTRIBUTION_LIMIT = 200;

/**
 * 纠错台（管理端）。
 *
 * 这里的方法都只做两件事之一：**改可见性**（屏蔽上报 / 封禁实例）或**改数据**
 * （人工写字段 / 合并重复条目），然后一律交给 ItemsService.recomputeItem 重放。
 * 之所以不直接改 CatalogItem 的字段值：字段值必须永远能从上报序列重算出来，
 * 否则"这条上报被屏蔽了但字段还留着它的值"这种矛盾状态就会出现。
 *
 * 注意 `items()` 与公开搜索的区别：管理端**要看到被合并掉的条目**（否则管理员
 * 无法确认合并结果、也无法把合并撤销），所以这里不按 mergedIntoId 过滤。
 */
export class AdminService {
  private readonly itemsService: ItemsService;
  private readonly instancesService: InstancesService;

  constructor(private readonly source: DataSource = getDataSource()) {
    this.itemsService = new ItemsService();
    this.instancesService = new InstancesService(source);
  }

  /**
   * 会话信息（前端用它渲染顶栏/侧边栏）。
   *
   * 顺带把**权重基准值**带出去：界面上要显示"权重低于 1.00 才算可疑"，
   * 而这个基准是可配的（`COLLECTOR_WEIGHT_INITIAL`）。写死 1 的话，
   * 管理员改了配置之后界面会一直说"没有可疑来源"，而服务端其实在按别的值判。
   */
  session(user: AdminUserView): AdminSessionView {
    return {
      ok: true,
      version: env.version,
      registrationOpen: env.registrationOpen,
      scope: 'admin',
      user,
      feedback: { initial: env.feedback.initial, min: env.feedback.min, max: env.feedback.max },
    };
  }

  /** 管理端列表：包含被合并掉的条目（公开搜索会把它们藏起来） */
  async items(query: QueryItemsDto): Promise<{
    items: AdminItemRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const needle = query.q?.trim().toLowerCase();
    const { page, pageSize, skip, take } = normalizePaging(query);
    const qb = itemsRepo(this.source.manager).createQueryBuilder('i');
    if (needle) {
      const { sql, params } = searchClause('i', needle);
      qb.where(sql, params);
    }
    qb.orderBy('i.updatedAt', 'DESC')
      .addOrderBy('i.id', 'DESC')
      .skip(skip)
      .take(take);
    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((row) => ({
        ...this.itemsService.toSummary(row),
        lockedFields: parseJson<string[]>(row.lockedFields, []),
        mergedIntoId: row.mergedIntoId,
      })),
      total,
      page,
      pageSize,
    };
  }

  async itemDetail(id: number): Promise<AdminItemDetailView> {
    const item = await this.itemsService.findById(id);
    const detail = await this.itemsService.detail(item);
    const rows = await contributionsRepo(this.source.manager)
      .createQueryBuilder('c')
      .where('c.catalogItemId = :itemId', { itemId: item.id })
      .orderBy('c.observedAt', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .take(DETAIL_CONTRIBUTION_LIMIT)
      .getMany();
    return {
      ...detail,
      mergedIntoId: item.mergedIntoId,
      contributions: rows.map((row) => this.toAdminContributionView(row, item)),
    };
  }

  async contributions(query: QueryAdminContributionsDto): Promise<{
    contributions: AdminContributionView[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { page, pageSize, skip, take } = normalizePaging(query);
    const qb = contributionsRepo(this.source.manager).createQueryBuilder('c');
    if (query.itemId !== undefined) {
      qb.andWhere('c.catalogItemId = :itemId', { itemId: query.itemId });
    }
    if (query.instanceId !== undefined) {
      qb.andWhere('c.instanceId = :instanceId', { instanceId: query.instanceId });
    }
    if (query.blocked !== undefined) {
      qb.andWhere('c.blocked = :blocked', { blocked: query.blocked ? 1 : 0 });
    }
    if (query.source !== undefined) qb.andWhere('c.source = :source', { source: query.source });
    qb.orderBy('c.id', 'DESC')
      .skip(skip)
      .take(take);
    const [rows, total] = await qb.getManyAndCount();

    const briefs = await this.itemBriefs(rows.map((row) => row.catalogItemId));
    const names = await this.itemsService.instanceNames(rows.map((row) => row.instanceId));
    return {
      contributions: rows.map((row) => {
        const brief = briefs.get(row.catalogItemId);
        return this.toAdminContributionView(
          row,
          {
            id: row.catalogItemId,
            barcode: brief?.barcode ?? null,
            name: brief?.name ?? null,
          },
          names,
        );
      }),
      total,
      page,
      pageSize,
    };
  }

  /** 屏蔽/解封单条上报，然后重放受影响物品的字段 */
  async setContributionBlocked(
    id: number,
    dto: BlockContributionDto,
  ): Promise<{ contribution: AdminContributionView; item: ItemSummaryView }> {
    const repo = contributionsRepo(this.source.manager);
    const row = await repo.findOne({ where: { id } });
    if (!row) {
      throw notFound('contribution.notFound', `上报 ${id} 不存在`);
    }
    row.blocked = dto.blocked;
    row.blockedReason = dto.blocked ? (dto.reason ?? null) : null;
    row.blockedAt = dto.blocked ? isoNow() : null;
    const saved = await repo.save(row);
    await this.itemsService.recomputeItem(saved.catalogItemId);
    const item = await this.itemsService.findById(saved.catalogItemId);
    return {
      contribution: this.toAdminContributionView(saved, {
        id: item.id,
        barcode: item.barcode,
        name: item.name,
      }),
      item: this.itemsService.toSummary(item),
    };
  }

  /**
   * 人工纠错：写一条 `source='admin'` 的上报，而不是直接改字段列。
   *
   * 这样做的好处是人工修改本身也成了"有来源、有时间、可屏蔽"的一条记录：
   * 重放时它按 observedAt 参与竞争（人工纠正总是最新），而且**能改被锁定的字段**
   * —— 锁定拦的是自动上报，否则锁上就再也改不动了（见 ItemsService.recomputeItem）。
   */
  async patchItem(
    id: number,
    dto: PatchItemDto,
  ): Promise<{ item: AdminItemDetailView; applied: string[] }> {
    await this.itemsService.findById(id);
    const payload: Record<string, unknown> = {};
    for (const field of SCALAR_FIELDS) {
      const value = (dto as Record<string, unknown>)[field];
      if (typeof value === 'string') payload[field] = value;
    }
    if (dto.imageUrls !== undefined) payload.imageUrls = dto.imageUrls;
    if (dto.attributes !== undefined) payload.attributes = dto.attributes;
    // clearFields 是"这次明确清空这些字段"：写 null 让它进入 explicitNullFields，
    // 重放时把字段置空并**删掉 fieldUpdatedAt**，之后任何新观测都能重新填上。
    for (const field of dto.clearFields ?? []) payload[field] = null;

    const hasPayload = Object.keys(payload).length > 0;
    let applied: string[] = [];

    const run = async (manager: EntityManager): Promise<void> => {
      const repo = itemsRepo(manager);
      const item = await repo.findOne({ where: { id } });
      if (!item) throw notFound('item.notFound', `物品 ${id} 不存在`);

      if (dto.lockedFields !== undefined) {
        item.lockedFields = JSON.stringify([...new Set(dto.lockedFields)].sort());
        await repo.save(item);
      }
      if (!hasPayload) return;

      const fields = normalizeFields(payload as ItemFields);
      await contributionsRepo(manager).save({
        catalogItemId: item.id,
        instanceId: null,
        barcode: item.barcode,
        // 存"管理员真正写下的键"（含 clearFields 的显式 null），不能存归一化结果：
        // normalizeFields 会把没提到的标量全补成 null，重放时 nullFieldsOf 会把它们全清掉。
        payload: JSON.stringify(payload),
        appliedFields: JSON.stringify([]),
        contentHash: contentHashOf(item.barcode, fields),
        source: 'admin',
        observedAt: isoNow(),
        blocked: false,
      });
      await this.itemsService.recomputeItem(item.id, manager);
      applied = Object.keys(payload);
    };

    await this.source.transaction(run);
    const detail = await this.itemDetail(id);
    return { item: detail, applied };
  }

  /**
   * 合并两个物品：把 source 的全部上报改挂到 target，再把 source 标记成 `mergedIntoId`。
   *
   * 为什么改挂上报而不是直接删 source：上报是唯一的事实来源，删掉就再也回不来了。
   * 标记之后 public 查询顺着 mergedIntoId 走（老条码仍然查得到），管理端仍然能看到
   * source 这一行（知道"它被并到哪了"），而且整个动作是可逆的 —— 把标记清掉即可。
   */
  async mergeItems(
    targetId: number,
    sourceItemId: number,
  ): Promise<{
    target: ItemDetailView;
    source: { id: number; barcode: string | null; mergedIntoId: number | null };
  }> {
    if (targetId === sourceItemId) {
      // legacy 这里用的是 BadRequestException：自己并自己是"请求不合法"，不是状态冲突。
      throw badRequest('item.mergeSelf', '不能把物品合并到它自己');
    }
    const source = await this.itemsService.findById(sourceItemId);
    if (source.mergedIntoId) {
      throw conflict(
        'item.alreadyMerged',
        `物品 ${sourceItemId} 已经被合并到 ${source.mergedIntoId}`,
      );
    }
    // target 自己也可能已经被合并了：以它的最终去向为准，避免"并到中间节点"造出二级链
    const target = await this.itemsService.requireById(targetId);

    await this.source.transaction(async (manager) => {
      await contributionsRepo(manager).update(
        { catalogItemId: source.id },
        { catalogItemId: target.id },
      );
      // 条码唯一：source 的条码要挪到 target（若 target 还没有条码），否则留着会在
      // 二次扫描时又建出一个新条目 —— 那正是合并要解决的问题。
      if (source.barcode && !target.barcode) {
        target.barcode = source.barcode;
        await itemsRepo(manager).save(target);
        source.barcode = null;
      }
      source.mergedIntoId = target.id;
      await itemsRepo(manager).save(source);
      await this.itemsService.recomputeItem(target.id, manager);
      await this.itemsService.refreshCounters(manager, source.id);
    });

    const freshTarget = await this.itemsService.findById(target.id);
    const freshSource = await this.itemsService.findById(sourceItemId);
    return {
      target: await this.itemsService.detail(freshTarget),
      source: {
        id: freshSource.id,
        barcode: freshSource.barcode,
        mergedIntoId: freshSource.mergedIntoId,
      },
    };
  }

  async instances(query: QueryAdminInstancesDto): Promise<{
    instances: InstanceView[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    return this.instancesService.list(query);
  }

  /** 封禁实例：它此前提交的所有上报一起失效，所以要把受影响的物品全部重放一遍 */
  async setInstanceBlocked(
    id: number,
    dto: BlockInstanceDto,
  ): Promise<{ instance: InstanceView; recomputedItems: number }> {
    const row = await this.instancesService.setBlocked(id, dto.blocked, dto.reason);
    const affected = await contributionsRepo(this.source.manager)
      .createQueryBuilder('c')
      .select('DISTINCT c.catalogItemId', 'catalogItemId')
      .where('c.instanceId = :id', { id })
      .getRawMany<{ catalogItemId: number }>();
    for (const affectedRow of affected) {
      await this.itemsService.recomputeItem(Number(affectedRow.catalogItemId));
    }
    return { instance: this.instancesService.toView(row), recomputedItems: affected.length };
  }

  /**
   * 重放**单个**条目。
   *
   * 屏蔽一条上报、封禁一个实例时，代码里已经在按"受影响条目"逐个 `recomputeItem`；
   * 界面上的「重放这个条目」按钮自然也该只重放它自己，而不是把整库扫一遍。
   * 复用 `ItemsService.recomputeItem`（唯一的写入点），条目不存在时由它抛 404。
   */
  async recomputeItem(id: number): Promise<{ recomputedItems: number; requested: number }> {
    await this.itemsService.recomputeItem(id);
    return { recomputedItems: 1, requested: id };
  }

  /** 全库重放：合并、手工改库、迁移之后用它把字段值统一对齐到上报序列 */
  async recomputeAll(): Promise<{ items: number }> {
    const rows = await itemsRepo(this.source.manager)
      .createQueryBuilder('i')
      .select('i.id', 'id')
      .where('i.mergedIntoId IS NULL')
      .getRawMany<{ id: number }>();
    for (const row of rows) {
      await this.itemsService.recomputeItem(Number(row.id));
    }
    return { items: rows.length };
  }

  async itemBriefs(
    ids: number[],
  ): Promise<Map<number, { barcode: string | null; name: string | null }>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await itemsRepo(this.source.manager)
      .createQueryBuilder('i')
      .select(['i.id AS id', 'i.barcode AS barcode', 'i.name AS name'])
      .where('i.id IN (:...ids)', { ids: unique })
      .getRawMany<{ id: number; barcode: string | null; name: string | null }>();
    return new Map(rows.map((row) => [Number(row.id), { barcode: row.barcode, name: row.name }]));
  }

  toAdminContributionView(
    row: ContributionRow,
    item: { id: number; barcode: string | null; name: string | null },
    names?: Map<number, string>,
  ): AdminContributionView {
    return {
      id: row.id,
      itemId: item.id,
      itemBarcode: item.barcode,
      itemName: item.name,
      instanceId: row.instanceId,
      // 找不到实例名时回落成 id 字符串：审计列表里"哪台机器"比"名字好看"重要，
      // 实例被删/被封禁也要能看出这条上报是谁发的。
      instanceName:
        row.instanceId === null ? null : (names?.get(row.instanceId) ?? String(row.instanceId)),
      source: row.source,
      observedAt: row.observedAt ?? row.createdAt.toISOString(),
      appliedFields: parseJson<string[]>(row.appliedFields, []),
      payload: parseJson<ItemFields>(row.payload, {}),
      blocked: row.blocked,
      blockedReason: row.blockedReason,
      blockedAt: row.blockedAt,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

