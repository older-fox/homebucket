import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CatalogItem } from '../entities/catalog-item.entity';
import { Contribution } from '../entities/contribution.entity';
import { CollectorInstance } from '../entities/collector-instance.entity';
import { ItemsService, type ItemDetailView, type ItemSummaryView } from '../items/items.service';
import { InstancesService, type InstanceRowView } from '../instances/instances.service';
import {
  contentHashOf,
  fieldsFromPayload,
  normalizeFields,
  SCALAR_FIELDS,
  type ItemFields,
} from '../common/identity';
import { parseJson } from '../common/json';
import { isoNow } from '../common/time';
import { normalizePaging } from '../common/pagination';
import { env } from '../config/env';
import type { BlockContributionDto, PatchItemDto, QueryAdminContributionsDto } from './dto';

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

/**
 * 纠错台的服务端：所有"改公共资料"的动作都在这里，且都遵循同一条路径 ——
 * 改数据（或它的可见性）→ 重放（recomputeItem）→ 返回新状态。
 *
 * 为什么人工纠错也写成一条 Contribution（source='admin'）而不是直接 UPDATE 字段：
 * ① 详情页要显示"这个值是谁给的"，人工值必须和自动值排在同一条时间线上，否则来源视图会缺一块；
 * ② 直接改列会让"屏蔽某条旧上报后重放"把人工值冲掉 —— 人工值在数据流里，重放就永远算得上它。
 */
@Injectable()
export class AdminService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly itemsService: ItemsService,
    private readonly instancesService: InstancesService,
  ) {}

  session() {
    return {
      ok: true,
      version: env.version,
      registrationOpen: env.registrationOpen,
      /** 让界面能提示"当前令牌已通过校验"，而不必自己存一份明文来对比 */
      scope: 'admin',
    };
  }

  /** 物品列表（管理视图）：比公开搜索多了"包含被合并条目"和锁定字段 */
  async items(query: { q?: string; page?: number; pageSize?: number }): Promise<{
    items: Array<ItemSummaryView & { lockedFields: string[]; mergedIntoId: number | null }>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { page, pageSize, skip, take } = normalizePaging(query);
    const like = query.q?.trim() ? `%${query.q.trim().toLowerCase()}%` : null;
    const qb = this.dataSource.getRepository(CatalogItem).createQueryBuilder('i');
    if (like) {
      qb.where(
        '(LOWER(i.barcode) LIKE :like OR LOWER(i.name) LIKE :like OR LOWER(i.model) LIKE :like' +
          ' OR LOWER(i.manufacturer) LIKE :like OR LOWER(i.category) LIKE :like)',
        { like },
      );
    }
    const [rows, total] = await qb
      .orderBy('i.updatedAt', 'DESC')
      .addOrderBy('i.id', 'DESC')
      .skip(skip)
      .take(take)
      .getManyAndCount();
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

  /** 单个物品的管理视图：字段来源 + **包含被屏蔽的上报**（纠错台要能看到并解除屏蔽） */
  async itemDetail(id: number): Promise<
    ItemDetailView & {
      mergedIntoId: number | null;
      contributions: AdminContributionView[];
    }
  > {
    const item = await this.itemsService.findById(id);
    const detail = await this.itemsService.detail(item);
    const rows = await this.dataSource
      .getRepository(Contribution)
      .find({ where: { catalogItemId: item.id }, order: { observedAt: 'DESC', id: 'DESC' }, take: 200 });
    const names = await this.itemsService.instanceNames(rows.map((row) => row.instanceId));
    const brief = { barcode: item.barcode, name: item.name };
    return {
      ...detail,
      mergedIntoId: item.mergedIntoId,
      contributions: rows.map((row) => this.toContributionView(row, names, item.id, brief)),
    };
  }

  async contributions(query: QueryAdminContributionsDto): Promise<{
    contributions: AdminContributionView[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { page, pageSize, skip, take } = normalizePaging(query);
    const qb = this.dataSource.getRepository(Contribution).createQueryBuilder('c');
    if (query.itemId) qb.andWhere('c.catalogItemId = :itemId', { itemId: query.itemId });
    if (query.instanceId) qb.andWhere('c.instanceId = :instanceId', { instanceId: query.instanceId });
    if (query.blocked !== undefined) qb.andWhere('c.blocked = :blocked', { blocked: query.blocked ? 1 : 0 });
    if (query.source) qb.andWhere('c.source = :source', { source: query.source });

    const [rows, total] = await qb
      .orderBy('c.id', 'DESC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    const names = await this.itemsService.instanceNames(rows.map((row) => row.instanceId));
    const briefs = await this.itemBriefs(rows.map((row) => row.catalogItemId));
    return {
      contributions: rows.map((row) =>
        this.toContributionView(row, names, row.catalogItemId, briefs.get(row.catalogItemId) ?? null),
      ),
      total,
      page,
      pageSize,
    };
  }

  /** 屏蔽/恢复一条上报，然后重放该物品 —— 这才是"屏蔽错误上报"真正生效的地方 */
  async setContributionBlocked(
    id: number,
    dto: BlockContributionDto,
  ): Promise<{ contribution: AdminContributionView; item: ItemSummaryView }> {
    const repo = this.dataSource.getRepository(Contribution);
    const row = await repo.findOneBy({ id });
    if (!row) {
      throw new NotFoundException({ code: 'contribution.notFound', message: `上报 ${id} 不存在` });
    }
    row.blocked = dto.blocked;
    row.blockedReason = dto.blocked ? (dto.reason ?? null) : null;
    row.blockedAt = dto.blocked ? isoNow() : null;
    const saved = await repo.save(row);
    const item = await this.itemsService.recomputeItem(row.catalogItemId);
    const names = await this.itemsService.instanceNames([saved.instanceId]);
    return {
      contribution: this.toContributionView(
        saved,
        names,
        item.id,
        { barcode: item.barcode, name: item.name },
      ),
      item: this.itemsService.toSummary(item),
    };
  }

  /**
   * 人工改字段：写一条 admin 上报（含要清空的字段的显式 null）→ 重放。
   * 同一次请求里可以顺带改 lockedFields：锁定 = 之后自动上报不再改写这些字段。
   */
  async patchItem(
    id: number,
    dto: PatchItemDto,
  ): Promise<{ item: ItemDetailView & { mergedIntoId: number | null }; applied: string[] }> {
    const item = await this.itemsService.findById(id);

    const payload: ItemFields = {};
    for (const field of SCALAR_FIELDS) {
      const value = (dto as Record<string, unknown>)[field];
      if (typeof value === 'string') payload[field] = value;
    }
    if (Array.isArray(dto.imageUrls)) payload.imageUrls = dto.imageUrls;
    if (dto.attributes) payload.attributes = dto.attributes;
    for (const field of dto.clearFields ?? []) payload[field as keyof ItemFields] = null as never;

    const hasPayload = Object.keys(payload).length > 0;

    const applied = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CatalogItem);
      if (dto.lockedFields !== undefined) {
        item.lockedFields = JSON.stringify([...new Set(dto.lockedFields)].sort());
        await repo.save(item);
      }
      if (!hasPayload) return [] as string[];
      const fields = normalizeFields(payload);
      const contributionRepo = manager.getRepository(Contribution);
      await contributionRepo.save(
        contributionRepo.create({
          catalogItemId: item.id,
          instanceId: null,
          barcode: item.barcode,
          payload: JSON.stringify(payload),
          appliedFields: JSON.stringify([]),
          contentHash: contentHashOf(item.barcode, fields),
          source: 'admin',
          observedAt: isoNow(),
          blocked: false,
        }),
      );
      await this.itemsService.recomputeItem(item.id, manager);
      return Object.keys(payload);
    });

    const refreshed = await this.itemsService.findById(id);
    return {
      item: {
        ...(await this.itemsService.detail(await this.itemsService.requireById(id))),
        mergedIntoId: refreshed.mergedIntoId,
      },
      applied,
    };
  }

  /**
   * 合并两个条目（把 sourceItemId 并进 id）。
   *
   * 条码交接规则：目标没有条码时把来源条码接过来，并把来源行的条码置空 ——
   * 否则两行会同时持有一个条码，撞唯一索引。来源行的 identityKey 留着，
   * 于是"老条码还能查到"这件事由合并重定向保证，而不是靠条码字段重复。
   */
  async mergeItems(
    targetId: number,
    sourceItemId: number,
  ): Promise<{ target: ItemDetailView; source: { id: number; barcode: string | null; mergedIntoId: number | null } }> {
    if (targetId === sourceItemId) {
      throw new BadRequestException({ code: 'item.mergeSelf', message: '不能把物品合并到它自己' });
    }
    const repo = this.dataSource.getRepository(CatalogItem);
    let target = await this.itemsService.findById(targetId);
    const source = await this.itemsService.findById(sourceItemId);
    if (source.mergedIntoId) {
      throw new ConflictException({
        code: 'item.alreadyMerged',
        message: `物品 ${sourceItemId} 已经被合并到 ${source.mergedIntoId}`,
      });
    }
    if (target.mergedIntoId) {
      target = await this.itemsService.requireById(targetId);
    }

    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(Contribution)
        .update({ catalogItemId: source.id }, { catalogItemId: target.id });
      if (source.barcode && !target.barcode) {
        target.barcode = source.barcode;
        await manager.getRepository(CatalogItem).save(target);
        source.barcode = null;
      }
      source.mergedIntoId = target.id;
      await manager.getRepository(CatalogItem).save(source);
      await this.itemsService.recomputeItem(target.id, manager);
      await this.itemsService.refreshCounters(manager, source.id);
    });

    return {
      target: await this.itemsService.detail(await this.itemsService.requireById(target.id)),
      source: { id: source.id, barcode: source.barcode, mergedIntoId: source.mergedIntoId },
    };
  }

  async instances(paging: { page?: number; pageSize?: number }): Promise<{
    instances: InstanceRowView[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    return this.instancesService.list(paging);
  }

  /**
   * 封禁/解封实例。
   * 封禁之后必须重放它上报过的**每个**物品：它的观测不再算数，
   * 那些物品的当前值可能要回退到别的实例给的值。只改一行 blocked 而不重放，
   * 会让"封禁"在详情页上看起来毫无效果（值还是刷量实例给的）。
   */
  async setInstanceBlocked(
    id: number,
    dto: { blocked: boolean; reason?: string },
  ): Promise<{ instance: InstanceRowView; recomputedItems: number }> {
    const instance = await this.instancesService.setBlocked(id, dto.blocked, dto.reason);
    const rows = await this.dataSource
      .getRepository(Contribution)
      .createQueryBuilder('c')
      .select('DISTINCT c.catalogItemId', 'id')
      .where('c.instanceId = :id', { id })
      .getRawMany<{ id: number }>();
    const ids = rows.map((row) => Number(row.id));
    for (const itemId of ids) {
      await this.itemsService.recomputeItem(itemId);
    }
    return { instance, recomputedItems: ids.length };
  }

  /** 全库重放：迁移后校验、或怀疑某次纠错造成不一致时的兜底按钮 */
  async recomputeAll(): Promise<{ items: number }> {
    const rows = await this.dataSource
      .getRepository(CatalogItem)
      .createQueryBuilder('i')
      .select('i.id', 'id')
      .where('i.mergedIntoId IS NULL')
      .getRawMany<{ id: number }>();
    for (const row of rows) {
      await this.itemsService.recomputeItem(Number(row.id));
    }
    return { items: rows.length };
  }

  private async itemBriefs(
    ids: number[],
  ): Promise<Map<number, { barcode: string | null; name: string | null }>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.dataSource
      .getRepository(CatalogItem)
      .createQueryBuilder('i')
      .select(['i.id AS id', 'i.barcode AS barcode', 'i.name AS name'])
      .where('i.id IN (:...ids)', { ids: unique })
      .getRawMany<{ id: number; barcode: string | null; name: string | null }>();
    return new Map(rows.map((row) => [Number(row.id), { barcode: row.barcode, name: row.name }]));
  }

  private toContributionView(
    row: Contribution,
    names: Map<number, string>,
    itemId: number,
    brief: { barcode: string | null; name: string | null } | null,
  ): AdminContributionView {
    return {
      id: row.id,
      itemId,
      itemBarcode: brief?.barcode ?? null,
      itemName: brief?.name ?? null,
      instanceId: row.instanceId,
      instanceName: row.instanceId ? (names.get(row.instanceId) ?? null) : null,
      source: row.source,
      observedAt: row.observedAt ?? row.createdAt.toISOString(),
      appliedFields: parseJson<string[]>(row.appliedFields, []),
      payload: fieldsFromPayload(row.payload),
      blocked: row.blocked,
      blockedReason: row.blockedReason,
      blockedAt: row.blockedAt,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
