import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Like, Not, type FindOptionsWhere, type Repository } from 'typeorm';
import { Attachment } from '../entities/attachment.entity';
import { Item } from '../entities/item.entity';
import { ItemUnit } from '../entities/item-unit.entity';
import { Location } from '../entities/location.entity';
import { Tag } from '../entities/tag.entity';
import { Template } from '../entities/template.entity';
import { CollectionService } from '../collection/collection.service';
import { ActivityService, diffFields, type ActivityActor } from '../activity/activity.service';
import { shortToken, traceCode } from '../common/id';
import { mediaUrl } from '../common/media';
import { normalizePaging } from '../common/pagination';
import { countByForeignKey } from '../common/relation-count';
import {
  factorOf,
  formatBreakdown,
  normalizePackLevels,
  normalizePackaging,
  packLevelsLabel,
  parsePackLevels,
  serializePackLevels,
} from './packaging';
import type { AdjustStockDto, CreateItemDto, ItemUnitDto, QueryItemsDto, UnpackDto, UpdateItemDto } from './dto';
import type { ActivityChange } from '../activity/activity.service';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(ItemUnit) private readonly units: Repository<ItemUnit>,
    @InjectRepository(Location) private readonly locations: Repository<Location>,
    @InjectRepository(Tag) private readonly tags: Repository<Tag>,
    @InjectRepository(Template) private readonly templates: Repository<Template>,
    @InjectRepository(Attachment) private readonly attachments: Repository<Attachment>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly collection: CollectionService,
    private readonly activity: ActivityService,
  ) {}

  async list(familyId: number, query: QueryItemsDto) {
    const { page, pageSize, skip } = normalizePaging(query.page, query.pageSize);

    const [rows, total] = await this.items.findAndCount({
      where: this.buildWhere(familyId, query),
      order: { createdAt: 'DESC' },
      skip,
      take: pageSize,
      // 旧接口用 select 只取关系的少数字段。TypeORM 的 relations 会加载整行，
      // 因此下面显式映射返回值，保持响应结构不变（不多吐字段）
      relations: { location: true, tags: true },
    });

    // 原先由 Prisma 的 `_count: { select: { units: true } }` 提供；TypeORM 1.x 删了
    // loadRelationCountAndMap，这里用一次聚合查询替代（见 common/relation-count.ts）
    const ids = rows.map((row) => row.id);
    const [unitCounts, outCounts] = await Promise.all([
      countByForeignKey(this.units, 'itemId', ids),
      // 「已取走」当前状态：有 SN 的物品按件追踪，取走的是 unit 而不是 item，
      // 所以列表除了 item.takenOutAt 还要带上"有几件正被拿走"，两条聚合并行发出
      countByForeignKey(this.units, 'itemId', ids, (qb) => qb.andWhere('row.takenOutAt IS NOT NULL')),
    ]);

    return {
      // 库存列表不返回缩略图，只给结构化数据
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        quantity: row.quantity,
        baseUnit: row.baseUnit,
        packLevels: parsePackLevels(row.packLevels),
        price: row.price,
        model: row.model,
        manufacturer: row.manufacturer,
        barcode: row.barcode,
        traceCode: row.traceCode,
        qrToken: row.qrToken,
        createdAt: row.createdAt,
        location: row.location ? { id: row.location.id, name: row.location.name } : null,
        tags: row.tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color })),
        unitCount: unitCounts.get(row.id) ?? 0,
        // 整件追踪（无 SN）时取走的是物品本身；takenOutAt 非空 = 当前已拿走使用
        takenOutAt: row.takenOutAt,
        takenOutUnitCount: outCounts.get(row.id) ?? 0,
      })),
      total,
      page,
      pageSize,
    };
  }

  async detail(familyId: number, id: number) {
    const item = await this.items.findOne({
      where: { id, familyId },
      relations: {
        location: true,
        template: true,
        tags: true,
        images: true,
        coverImage: true,
        units: { location: true },
      },
      order: { units: { id: 'ASC' } },
    });
    if (!item) throw new NotFoundException({ code: 'item.notFound', message: '物品不存在' });

    return {
      id: item.id,
      familyId: item.familyId,
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      baseUnit: item.baseUnit,
      packLevels: parsePackLevels(item.packLevels),
      price: item.price,
      model: item.model,
      manufacturer: item.manufacturer,
      barcode: item.barcode,
      traceCode: item.traceCode,
      qrToken: item.qrToken,
      locationId: item.locationId,
      templateId: item.templateId,
      coverImageId: item.coverImageId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      // 当前取走状态：整件追踪看 item.takenOutAt，按件追踪看每个 unit 的 takenOutAt
      takenOutAt: item.takenOutAt,
      takenOutUnitCount: item.units.filter((unit) => unit.takenOutAt).length,
      location: item.location ? { id: item.location.id, name: item.location.name } : null,
      template: item.template ? { id: item.template.id, name: item.template.name } : null,
      tags: item.tags,
      units: item.units.map((unit) => ({
        id: unit.id,
        sn: unit.sn,
        locationId: unit.locationId,
        note: unit.note,
        takenOutAt: unit.takenOutAt,
        location: unit.location ? { id: unit.location.id, name: unit.location.name } : null,
      })),
      coverImageUrl: mediaUrl(item.coverImage),
      images: item.images.map((image) => ({
        id: image.id,
        url: mediaUrl(image),
        mime: image.mime,
        size: image.size,
      })),
    };
  }

  async create(familyId: number, actor: ActivityActor, dto: CreateItemDto) {
    await this.assertRelations(familyId, dto);
    await this.assertBarcodeAvailable(familyId, dto.barcode);
    await this.assertTraceCodeAvailable(familyId, dto.traceCode);

    // 创建 = 一串"从无到有"的差异（from 全为 null）；值在写入前解析成可直接展示的形式
    const changes = diffFields({}, await this.itemSnapshotFromDto(familyId, dto));
    const packaging = normalizePackaging(dto.baseUnit, dto.packLevels);

    // 主记录 + 序列号 + 多对多关系放同一个事务，避免中途失败留下半条数据；
    // 历史与业务同事务写入，保证审计不丢行
    const created = await this.dataSource.transaction(async (manager) => {
      const item = manager.create(Item, {
        familyId,
        name: dto.name,
        description: dto.description ?? null,
        quantity: dto.quantity ?? 1,
        baseUnit: packaging.baseUnit,
        packLevels: packaging.packLevels,
        price: dto.price ?? 0,
        model: dto.model ?? null,
        manufacturer: dto.manufacturer ?? null,
        barcode: dto.barcode?.trim() || null,
        traceCode: dto.traceCode?.trim().toUpperCase() || null,
        locationId: dto.locationId ?? null,
        templateId: dto.templateId ?? null,
        coverImageId: dto.coverImageId ?? null,
        qrToken: shortToken(),
        tags: dto.tagIds?.length ? await manager.findBy(Tag, { id: In(dto.tagIds), familyId }) : [],
        images: dto.imageIds?.length
          ? await manager.findBy(Attachment, { id: In(dto.imageIds), familyId })
          : [],
      });
      const saved = await manager.save(item);

      if (dto.units?.length) {
        await manager.save(
          dto.units.map((unit) =>
            manager.create(ItemUnit, {
              familyId,
              itemId: saved.id,
              sn: unit.sn ?? null,
              locationId: unit.locationId ?? null,
              note: unit.note ?? null,
            }),
          ),
        );
      }

      await this.activity.record(
        familyId,
        actor,
        {
          targetType: 'item',
          targetId: saved.id,
          itemId: saved.id,
          itemName: saved.name,
          action: 'item.create',
          changes,
        },
        manager,
      );

      return saved;
    });

    // 把新条码信息回传给收集服务（开关控制，失败不影响主流程）
    if (dto.barcode) {
      void this.collection.submit({
        barcode: dto.barcode.trim(),
        name: dto.name,
        manufacturer: dto.manufacturer,
        model: dto.model,
      });
    }

    return { id: created.id, name: created.name, qrToken: created.qrToken };
  }

  async update(familyId: number, actor: ActivityActor, id: number, dto: UpdateItemDto) {
    const item = await this.mustExist(familyId, id);
    await this.assertRelations(familyId, dto);
    await this.assertBarcodeAvailable(familyId, dto.barcode, id);

    // 先算好改动前后的可展示快照，再在事务里落库 + 记历史（后者与前者同事务，审计不丢行）
    const before = await this.itemSnapshotById(familyId, id);
    const after = await this.applyItemDtoToSnapshot(familyId, before, dto);

    await this.dataSource.transaction(async (manager) => {
      // 只覆盖 dto 里出现过的字段（Prisma 的 undefined = 不改，这里保持一致）
      if (dto.name !== undefined) item.name = dto.name;
      if (dto.description !== undefined) item.description = dto.description ?? null;
      if (dto.quantity !== undefined) item.quantity = dto.quantity;
      if (dto.baseUnit !== undefined || dto.packLevels !== undefined) {
        const nextBase = dto.baseUnit !== undefined ? dto.baseUnit?.trim() || null : item.baseUnit;
        if (dto.packLevels !== undefined) {
          item.packLevels = serializePackLevels(normalizePackLevels(dto.packLevels));
        }
        item.baseUnit = nextBase;
        // 最小单位名为空 = 关闭包装，层级一并清掉，避免"有层级却没单位名"的坏状态
        if (!nextBase) item.packLevels = null;
      }
      if (dto.price !== undefined) item.price = dto.price;
      if (dto.model !== undefined) item.model = dto.model ?? null;
      if (dto.manufacturer !== undefined) item.manufacturer = dto.manufacturer ?? null;
      if (dto.barcode !== undefined) item.barcode = dto.barcode.trim() || null;
      if (dto.locationId !== undefined) item.locationId = dto.locationId ?? null;
      if (dto.coverImageId !== undefined) item.coverImageId = dto.coverImageId ?? null;
      if (dto.tagIds !== undefined) {
        item.tags = dto.tagIds.length ? await manager.findBy(Tag, { id: In(dto.tagIds), familyId }) : [];
      }
      if (dto.imageIds !== undefined) {
        item.images = dto.imageIds.length
          ? await manager.findBy(Attachment, { id: In(dto.imageIds), familyId })
          : [];
      }
      // updatedAt 由 @UpdateDateColumn 自动维护
      await manager.save(item);

      const changes = diffFields(before, after);
      // 空改动不记流水（例如只提交了同样的值）
      if (changes.length) {
        await this.activity.record(
          familyId,
          actor,
          {
            targetType: 'item',
            targetId: item.id,
            itemId: item.id,
            itemName: item.name,
            action: 'item.update',
            changes,
          },
          manager,
        );
      }
    });

    if (dto.barcode) {
      void this.collection.submit({
        barcode: dto.barcode.trim(),
        name: dto.name,
        manufacturer: dto.manufacturer,
        model: dto.model,
      });
    }

    return this.detail(familyId, id);
  }

  async remove(familyId: number, actor: ActivityActor, id: number) {
    const before = await this.itemSnapshotById(familyId, id);
    const changes = diffFields(before, {});

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(Item, { id });
      // 名下的 SN 随外键级联删除，不逐条记历史；整件删除记一条即可
      await this.activity.record(
        familyId,
        actor,
        {
          targetType: 'item',
          targetId: id,
          itemId: id,
          itemName: typeof before.name === 'string' ? before.name : null,
          action: 'item.delete',
          changes,
        },
        manager,
      );
    });

    return { ok: true };
  }

  // ---------- 序列号单元（每个 SN 可以放在不同位置） ----------

  async addUnit(familyId: number, actor: ActivityActor, itemId: number, dto: ItemUnitDto) {
    const item = await this.mustExist(familyId, itemId);
    if (dto.locationId) await this.mustLocation(familyId, dto.locationId);
    if (dto.sn) await this.assertSnAvailable(familyId, dto.sn);

    const changes = diffFields(
      {},
      this.unitFields(await this.locationName(familyId, dto.locationId ?? null), dto.sn ?? null, dto.note ?? null),
    );

    return this.dataSource.transaction(async (manager) => {
      const unit = await manager.save(
        manager.create(ItemUnit, {
          familyId,
          itemId,
          sn: dto.sn ?? null,
          locationId: dto.locationId ?? null,
          note: dto.note ?? null,
        }),
      );
      await this.activity.record(
        familyId,
        actor,
        {
          targetType: 'unit',
          targetId: unit.id,
          itemId,
          itemName: item.name,
          action: 'unit.create',
          changes,
        },
        manager,
      );
      return unit;
    });
  }

  async updateUnit(familyId: number, actor: ActivityActor, itemId: number, unitId: number, dto: ItemUnitDto) {
    const unit = await this.mustUnit(familyId, itemId, unitId);
    if (dto.locationId) await this.mustLocation(familyId, dto.locationId);
    if (dto.sn) await this.assertSnAvailable(familyId, dto.sn, unitId);

    const before = this.unitFields(
      await this.locationName(familyId, unit.locationId),
      unit.sn,
      unit.note,
    );
    const after = { ...before };
    if (dto.sn !== undefined) after.sn = dto.sn ?? null;
    if (dto.locationId !== undefined) after.location = await this.locationName(familyId, dto.locationId ?? null);
    if (dto.note !== undefined) after.note = dto.note ?? null;
    const changes = diffFields(before, after);
    const itemName = await this.itemName(familyId, itemId);

    return this.dataSource.transaction(async (manager) => {
      if (dto.sn !== undefined) unit.sn = dto.sn ?? null;
      if (dto.locationId !== undefined) unit.locationId = dto.locationId ?? null;
      if (dto.note !== undefined) unit.note = dto.note ?? null;
      const saved = await manager.save(unit);

      if (changes.length) {
        await this.activity.record(
          familyId,
          actor,
          { targetType: 'unit', targetId: saved.id, itemId, itemName, action: 'unit.update', changes },
          manager,
        );
      }
      return saved;
    });
  }

  async removeUnit(familyId: number, actor: ActivityActor, itemId: number, unitId: number) {
    const unit = await this.mustUnit(familyId, itemId, unitId);
    const before = this.unitFields(await this.locationName(familyId, unit.locationId), unit.sn, unit.note);
    const changes = diffFields(before, {});
    const itemName = await this.itemName(familyId, itemId);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(ItemUnit, { id: unitId });
      await this.activity.record(
        familyId,
        actor,
        { targetType: 'unit', targetId: unitId, itemId, itemName, action: 'unit.delete', changes },
        manager,
      );
    });

    return { ok: true };
  }

  // ---------- 消耗 / 补货 / 拆箱 ----------

  /** 用掉：按包装层级（缺省 = 最小单位）扣减库存，记 item.consume */
  consume(familyId: number, actor: ActivityActor, id: number, dto: AdjustStockDto) {
    return this.adjustStock(familyId, actor, id, dto, -1);
  }

  /** 补货：按包装层级增加库存，记 item.restock */
  restock(familyId: number, actor: ActivityActor, id: number, dto: AdjustStockDto) {
    return this.adjustStock(familyId, actor, id, dto, 1);
  }

  private async adjustStock(
    familyId: number,
    actor: ActivityActor,
    id: number,
    dto: AdjustStockDto,
    sign: 1 | -1,
  ) {
    const item = await this.mustExist(familyId, id);
    const levels = parsePackLevels(item.packLevels);
    if (dto.level && !levels.some((level) => level.name === dto.level)) {
      throw new BadRequestException({ code: 'item.levelUnknown', message: '未知的包装单位' });
    }

    const delta = sign * dto.amount * factorOf(dto.level, levels);
    const next = item.quantity + delta;
    if (next < 0) {
      throw new BadRequestException({ code: 'item.notEnoughStock', message: '库存不足' });
    }

    const changes = diffFields({ quantity: item.quantity }, { quantity: next });
    if (dto.note) changes.push({ field: 'note', from: null, to: dto.note });

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Item, { id }, { quantity: next });
      await this.activity.record(
        familyId,
        actor,
        {
          targetType: 'item',
          targetId: id,
          itemId: id,
          itemName: item.name,
          action: sign < 0 ? 'item.consume' : 'item.restock',
          changes,
        },
        manager,
      );
    });

    return this.detail(familyId, id);
  }

  /**
   * 拆箱：只留痕，不改库存。
   * 库存本就以最小单位存，"箱/散"是展示层自动换算的，所以拆箱没有数据动作；
   * 这里只是让用户可以标记"今天开了一箱"。
   */
  async unpack(familyId: number, actor: ActivityActor, id: number, dto: UnpackDto) {
    const item = await this.mustExist(familyId, id);
    if (!item.baseUnit && parsePackLevels(item.packLevels).length === 0) {
      throw new BadRequestException({ code: 'item.noPackaging', message: '该物品未配置包装单位' });
    }

    const changes: ActivityChange[] = [];
    if (dto.note) changes.push({ field: 'note', from: null, to: dto.note });

    await this.activity.record(familyId, actor, {
      targetType: 'item',
      targetId: id,
      itemId: id,
      itemName: item.name,
      action: 'item.unpack',
      changes,
    });

    return this.detail(familyId, id);
  }

  // ---------- 历史快照（把 id 解析成可展示的值，供 diff 使用） ----------

  /** 直接的标量字段 */
  private itemFields(item: {
    name: string;
    description: string | null;
    quantity: number;
    price: number;
    model: string | null;
    manufacturer: string | null;
    barcode: string | null;
    coverImageId: number | null;
    baseUnit: string | null;
    packLevels: string | null;
  }): Record<string, unknown> {
    return {
      name: item.name,
      description: item.description ?? null,
      quantity: item.quantity,
      price: item.price,
      model: item.model ?? null,
      manufacturer: item.manufacturer ?? null,
      barcode: item.barcode ?? null,
      coverImage: Boolean(item.coverImageId),
      baseUnit: item.baseUnit ?? null,
      // 用可读串（箱=24, 提=6）而非原始 JSON，历史差异才看得懂
      packLevels: packLevelsLabel(parsePackLevels(item.packLevels)),
    };
  }

  /** 加载物品（含标签/图集）并解析成历史快照，作为 diff 的 before */
  private async itemSnapshotById(familyId: number, id: number): Promise<Record<string, unknown>> {
    const item = await this.items.findOne({
      where: { id, familyId },
      relations: { tags: true, images: true },
    });
    if (!item) throw new NotFoundException({ code: 'item.notFound', message: '物品不存在' });

    return {
      ...this.itemFields(item),
      location: await this.locationName(familyId, item.locationId),
      tags: item.tags.map((tag) => tag.name).sort(),
      images: item.images.length,
    };
  }

  /** create 用：dto 即最终值（默认值与实体保持一致） */
  private async itemSnapshotFromDto(familyId: number, dto: CreateItemDto): Promise<Record<string, unknown>> {
    return {
      name: dto.name,
      description: dto.description ?? null,
      quantity: dto.quantity ?? 1,
      price: dto.price ?? 0,
      model: dto.model ?? null,
      manufacturer: dto.manufacturer ?? null,
      barcode: dto.barcode?.trim() || null,
      baseUnit: dto.baseUnit?.trim() || null,
      packLevels: packLevelsLabel(normalizePackLevels(dto.packLevels)),
      location: await this.locationName(familyId, dto.locationId ?? null),
      tags: (await this.tagNames(familyId, dto.tagIds)).sort(),
      coverImage: Boolean(dto.coverImageId),
      images: dto.imageIds?.length ?? 0,
    };
  }

  /** update 用：在 before 基础上只覆盖 dto 出现过的字段，与服务里 patching 的逻辑一一对应 */
  private async applyItemDtoToSnapshot(
    familyId: number,
    before: Record<string, unknown>,
    dto: UpdateItemDto,
  ): Promise<Record<string, unknown>> {
    const after = { ...before };
    if (dto.name !== undefined) after.name = dto.name;
    if (dto.description !== undefined) after.description = dto.description ?? null;
    if (dto.quantity !== undefined) after.quantity = dto.quantity;
    if (dto.price !== undefined) after.price = dto.price;
    if (dto.model !== undefined) after.model = dto.model ?? null;
    if (dto.manufacturer !== undefined) after.manufacturer = dto.manufacturer ?? null;
    if (dto.barcode !== undefined) after.barcode = dto.barcode.trim() || null;
    if (dto.baseUnit !== undefined || dto.packLevels !== undefined) {
      const nextBase = dto.baseUnit !== undefined ? dto.baseUnit?.trim() || null : (after.baseUnit as string | null);
      after.baseUnit = nextBase;
      if (dto.packLevels !== undefined) after.packLevels = packLevelsLabel(normalizePackLevels(dto.packLevels));
      if (!nextBase) after.packLevels = null;
    }
    if (dto.locationId !== undefined) after.location = await this.locationName(familyId, dto.locationId ?? null);
    if (dto.tagIds !== undefined) after.tags = (await this.tagNames(familyId, dto.tagIds)).sort();
    if (dto.coverImageId !== undefined) after.coverImage = Boolean(dto.coverImageId);
    if (dto.imageIds !== undefined) after.images = dto.imageIds.length;
    return after;
  }

  private unitFields(location: string | null, sn: string | null, note: string | null): Record<string, unknown> {
    return { sn: sn ?? null, location, note: note ?? null };
  }

  /** 位置名（无 id 返回 null，省一次查询） */
  private async locationName(familyId: number, locationId: number | null): Promise<string | null> {
    if (!locationId) return null;
    const row = await this.locations.findOne({
      where: { id: locationId, familyId },
      select: { name: true },
    });
    return row?.name ?? null;
  }

  /** 一组标签 id 的名字（顺序由调用方 sort 稳定） */
  private async tagNames(familyId: number, tagIds?: number[]): Promise<string[]> {
    if (!tagIds?.length) return [];
    const tags = await this.tags.findBy({ id: In(tagIds), familyId });
    return tags.map((tag) => tag.name);
  }

  private async itemName(familyId: number, itemId: number): Promise<string | null> {
    const row = await this.items.findOne({ where: { id: itemId, familyId }, select: { name: true } });
    return row?.name ?? null;
  }

  // ---------- CSV 导出（不含缩略图） ----------

  async exportCsv(familyId: number, query: QueryItemsDto) {
    const rows = await this.items.find({
      where: this.buildWhere(familyId, query),
      relations: { location: true, tags: true, units: { location: true } },
      order: { createdAt: 'DESC', units: { id: 'ASC' } },
    });

    const header = [
      '名称',
      '数量',
      '包装明细',
      '单价',
      '总价',
      '型号',
      '制造商',
      '商品条码',
      '追溯码',
      '位置',
      '标签',
      '序列号/条码',
      '取走状态',
      '描述',
      '创建时间',
    ];

    const lines = rows.map((row) => {
      const outUnitCount = row.units.filter((unit) => unit.takenOutAt).length;
      // 整件追踪看 item.takenOutAt；按件追踪看有多少件正被拿走
      const takenOut = row.takenOutAt
        ? `已取走（${row.takenOutAt.toISOString()}）`
        : outUnitCount > 0
          ? `部分取走（${outUnitCount}/${row.units.length}）`
          : '在库';

      return [
        row.name,
        String(row.quantity),
        formatBreakdown(row.quantity, parsePackLevels(row.packLevels), row.baseUnit),
        row.price.toFixed(2),
        (row.price * row.quantity).toFixed(2),
        row.model ?? '',
        row.manufacturer ?? '',
        row.barcode ?? '',
        row.traceCode ?? '',
        row.location?.name ?? '',
        row.tags.map((tag) => tag.name).join(' / '),
        row.units
          .map((unit) => {
            const label = unit.location ? `${unit.sn ?? ''}@${unit.location.name}` : (unit.sn ?? '');
            // 序列号列顺带标出正在被拿走的那几件，导出后也能一眼看出状态
            return unit.takenOutAt ? `${label}（已取走）` : label;
          })
          .join(' | '),
        takenOut,
        row.description ?? '',
        row.createdAt.toISOString(),
      ]
        .map(csvCell)
        .join(',');
    });

    // BOM 让 Excel 正确识别 UTF-8
    return `\uFEFF${[header.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`;
  }

  // ---------- 内部工具 ----------

  /**
   * 把 Prisma 的 where 翻译成 TypeORM 的 FindOptionsWhere。
   *
   * 两点要注意：
   *   1. 顶层 AND + 一个 OR 组：用"where 数组"表达 OR，每个元素都带上同样的 AND 条件
   *   2. **绝不能把 undefined 放进 where**：TypeORM 1.x 的 invalidWhereValuesBehavior
   *      默认是 "throw"，where 里出现 null/undefined 会直接抛 TypeORMError（Prisma 会忽略）
   */
  private buildWhere(familyId: number, query: QueryItemsDto): FindOptionsWhere<Item>[] | FindOptionsWhere<Item> {
    const base: FindOptionsWhere<Item> = { familyId };

    if (query.locationId) base.locationId = query.locationId;
    if (query.tagId) base.tags = { id: query.tagId };
    if (query.sn) base.units = { sn: Like(`%${query.sn}%`) };

    if (!query.q) return base;

    // 关键字搜索：名称/条码/追溯码/型号/制造商/描述/序列号/位置名/标签名
    const q = `%${query.q}%`;
    return [
      { ...base, name: Like(q) },
      { ...base, barcode: Like(q) },
      { ...base, traceCode: Like(q) },
      { ...base, model: Like(q) },
      { ...base, manufacturer: Like(q) },
      { ...base, description: Like(q) },
      { ...base, units: { sn: Like(q) } },
      { ...base, location: { name: Like(q) } },
      { ...base, tags: { name: Like(q) } },
    ];
  }

  private async mustExist(familyId: number, id: number): Promise<Item> {
    const item = await this.items.findOne({ where: { id, familyId } });
    if (!item) throw new NotFoundException({ code: 'item.notFound', message: '物品不存在' });
    return item;
  }

  private async mustUnit(familyId: number, itemId: number, unitId: number): Promise<ItemUnit> {
    const unit = await this.units.findOne({ where: { id: unitId, itemId, familyId } });
    if (!unit) throw new NotFoundException({ code: 'item.unitNotFound', message: '序列号记录不存在' });
    return unit;
  }

  /** 商品条码在同一个家庭内唯一 */
  private async assertBarcodeAvailable(familyId: number, barcode?: string, exceptItemId?: number) {
    const code = barcode?.trim();
    if (!code) return;

    // 注意：排除自身的条件必须"只在有值时添加"，不能写成 id: undefined（会抛错）
    const where: FindOptionsWhere<Item> = { familyId, barcode: code };
    if (exceptItemId) where.id = Not(exceptItemId);

    if (await this.items.exists({ where })) {
      throw new ConflictException({
        code: 'item.barcodeTaken',
        message: '该商品条码已被本家庭的其他物品使用',
      });
    }
  }

  /**
   * 生成一个家庭内唯一的追溯码。
   * 随机空间是 32^8 ≈ 1.1e12，碰撞概率极低；仍然循环重试几次并最终靠唯一索引兜底。
   */
  async mintTraceCode(familyId: number): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = traceCode();
      if (!(await this.items.exists({ where: { familyId, traceCode: candidate } }))) return candidate;
    }
    throw new ConflictException({
      code: 'item.traceCodeFailed',
      message: '生成追溯码失败，请重试',
    });
  }

  /** 追溯码在同一个家庭内唯一 */
  private async assertTraceCodeAvailable(familyId: number, value?: string, exceptItemId?: number) {
    const code = value?.trim().toUpperCase();
    if (!code) return;

    const where: FindOptionsWhere<Item> = { familyId, traceCode: code };
    if (exceptItemId) where.id = Not(exceptItemId);

    if (await this.items.exists({ where })) {
      throw new ConflictException({
        code: 'item.traceCodeTaken',
        message: '该追溯码已被本家庭的其他物品使用',
      });
    }
  }

  private async mustLocation(familyId: number, locationId: number) {
    const exists = await this.locations.exists({ where: { id: locationId, familyId } });
    if (!exists) throw new BadRequestException({ code: 'location.notFound', message: '位置不存在' });
  }

  private async mustTemplate(familyId: number, templateId: number) {
    const exists = await this.templates.exists({ where: { id: templateId, familyId } });
    if (!exists) throw new BadRequestException({ code: 'template.notFound', message: '模板不存在' });
  }

  private async assertSnAvailable(familyId: number, sn: string, exceptUnitId?: number) {
    const where: FindOptionsWhere<ItemUnit> = { familyId, sn };
    if (exceptUnitId) where.id = Not(exceptUnitId);

    if (await this.units.exists({ where })) {
      throw new BadRequestException({ code: 'item.snTaken', message: '该序列号/条码已存在' });
    }
  }

  private async assertRelations(
    familyId: number,
    dto: {
      locationId?: number;
      templateId?: number;
      tagIds?: number[];
      imageIds?: number[];
      coverImageId?: number;
      units?: ItemUnitDto[];
    },
  ) {
    if (dto.locationId) await this.mustLocation(familyId, dto.locationId);

    // templateId 同样是家庭内的外键：不校验的话，引用别的家庭 / 不存在的模板会
    // 直接撞外键约束抛 500，而不是给出可读的 400
    if (dto.templateId) await this.mustTemplate(familyId, dto.templateId);

    for (const unit of dto.units ?? []) {
      if (unit.locationId) await this.mustLocation(familyId, unit.locationId);
    }

    if (dto.tagIds?.length) {
      const count = await this.tags.count({ where: { familyId, id: In(dto.tagIds) } });
      if (count !== dto.tagIds.length) {
        throw new BadRequestException({ code: 'tag.notFound', message: '标签不存在' });
      }
    }

    const imageIds = [...new Set([...(dto.imageIds ?? []), ...(dto.coverImageId ? [dto.coverImageId] : [])])];
    if (imageIds.length) {
      const count = await this.attachments.count({ where: { familyId, id: In(imageIds) } });
      if (count !== imageIds.length) {
        throw new BadRequestException({ code: 'upload.notFound', message: '图片不存在' });
      }
    }
  }
}

function csvCell(value: string): string {
  const text = value ?? '';
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
