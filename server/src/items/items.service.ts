import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Like, Not, type FindOptionsWhere, type Repository } from 'typeorm';
import { Attachment } from '../entities/attachment.entity';
import { Item } from '../entities/item.entity';
import { ItemUnit } from '../entities/item-unit.entity';
import { Location } from '../entities/location.entity';
import { Tag } from '../entities/tag.entity';
import { CollectionService } from '../collection/collection.service';
import { shortToken, traceCode } from '../common/id';
import { mediaUrl } from '../common/media';
import { normalizePaging } from '../common/pagination';
import { countByForeignKey } from '../common/relation-count';
import type { CreateItemDto, ItemUnitDto, QueryItemsDto, UpdateItemDto } from './dto';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(ItemUnit) private readonly units: Repository<ItemUnit>,
    @InjectRepository(Location) private readonly locations: Repository<Location>,
    @InjectRepository(Tag) private readonly tags: Repository<Tag>,
    @InjectRepository(Attachment) private readonly attachments: Repository<Attachment>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly collection: CollectionService,
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
    const unitCounts = await countByForeignKey(this.units, 'itemId', rows.map((row) => row.id));

    return {
      // 库存列表不返回缩略图，只给结构化数据
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        quantity: row.quantity,
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
      location: item.location ? { id: item.location.id, name: item.location.name } : null,
      template: item.template ? { id: item.template.id, name: item.template.name } : null,
      tags: item.tags,
      units: item.units.map((unit) => ({
        id: unit.id,
        sn: unit.sn,
        locationId: unit.locationId,
        note: unit.note,
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

  async create(familyId: number, dto: CreateItemDto) {
    await this.assertRelations(familyId, dto);
    await this.assertBarcodeAvailable(familyId, dto.barcode);
    await this.assertTraceCodeAvailable(familyId, dto.traceCode);

    // 主记录 + 序列号 + 多对多关系放同一个事务，避免中途失败留下半条数据
    const created = await this.dataSource.transaction(async (manager) => {
      const item = manager.create(Item, {
        familyId,
        name: dto.name,
        description: dto.description ?? null,
        quantity: dto.quantity ?? 1,
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

  async update(familyId: number, id: number, dto: UpdateItemDto) {
    const item = await this.mustExist(familyId, id);
    await this.assertRelations(familyId, dto);
    await this.assertBarcodeAvailable(familyId, dto.barcode, id);

    await this.dataSource.transaction(async (manager) => {
      // 只覆盖 dto 里出现过的字段（Prisma 的 undefined = 不改，这里保持一致）
      if (dto.name !== undefined) item.name = dto.name;
      if (dto.description !== undefined) item.description = dto.description ?? null;
      if (dto.quantity !== undefined) item.quantity = dto.quantity;
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

  async remove(familyId: number, id: number) {
    await this.mustExist(familyId, id);
    await this.items.delete({ id });
    return { ok: true };
  }

  // ---------- 序列号单元（每个 SN 可以放在不同位置） ----------

  async addUnit(familyId: number, itemId: number, dto: ItemUnitDto) {
    await this.mustExist(familyId, itemId);
    if (dto.locationId) await this.mustLocation(familyId, dto.locationId);
    if (dto.sn) await this.assertSnAvailable(familyId, dto.sn);

    return this.units.save(
      this.units.create({
        familyId,
        itemId,
        sn: dto.sn ?? null,
        locationId: dto.locationId ?? null,
        note: dto.note ?? null,
      }),
    );
  }

  async updateUnit(familyId: number, itemId: number, unitId: number, dto: ItemUnitDto) {
    const unit = await this.mustUnit(familyId, itemId, unitId);
    if (dto.locationId) await this.mustLocation(familyId, dto.locationId);
    if (dto.sn) await this.assertSnAvailable(familyId, dto.sn, unitId);

    if (dto.sn !== undefined) unit.sn = dto.sn ?? null;
    if (dto.locationId !== undefined) unit.locationId = dto.locationId ?? null;
    if (dto.note !== undefined) unit.note = dto.note ?? null;
    return this.units.save(unit);
  }

  async removeUnit(familyId: number, itemId: number, unitId: number) {
    await this.mustUnit(familyId, itemId, unitId);
    await this.units.delete({ id: unitId });
    return { ok: true };
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
      '单价',
      '总价',
      '型号',
      '制造商',
      '商品条码',
      '追溯码',
      '位置',
      '标签',
      '序列号/条码',
      '描述',
      '创建时间',
    ];

    const lines = rows.map((row) =>
      [
        row.name,
        String(row.quantity),
        row.price.toFixed(2),
        (row.price * row.quantity).toFixed(2),
        row.model ?? '',
        row.manufacturer ?? '',
        row.barcode ?? '',
        row.traceCode ?? '',
        row.location?.name ?? '',
        row.tags.map((tag) => tag.name).join(' / '),
        row.units
          .map((unit) => (unit.location ? `${unit.sn ?? ''}@${unit.location.name}` : (unit.sn ?? '')))
          .join(' | '),
        row.description ?? '',
        row.createdAt.toISOString(),
      ]
        .map(csvCell)
        .join(','),
    );

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

  private async assertSnAvailable(familyId: number, sn: string, exceptUnitId?: number) {
    const where: FindOptionsWhere<ItemUnit> = { familyId, sn };
    if (exceptUnitId) where.id = Not(exceptUnitId);

    if (await this.units.exists({ where })) {
      throw new BadRequestException({ code: 'item.snTaken', message: '该序列号/条码已存在' });
    }
  }

  private async assertRelations(
    familyId: number,
    dto: { locationId?: number; tagIds?: number[]; imageIds?: number[]; coverImageId?: number; units?: ItemUnitDto[] },
  ) {
    if (dto.locationId) await this.mustLocation(familyId, dto.locationId);

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
