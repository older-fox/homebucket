import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionService } from '../collection/collection.module';
import { shortToken } from '../common/id';
import type { CreateItemDto, ItemUnitDto, QueryItemsDto, UpdateItemDto } from './dto';

type AttachmentLike = { key: string; url: string | null } | null;

/** 附件访问地址：local 模式没有 url，用后端静态路由拼 */
const mediaUrl = (attachment: AttachmentLike) =>
  attachment ? attachment.url || `/api/media/${attachment.key}` : null;

const priceNumber = (value: unknown) => Number(value ?? 0);

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collection: CollectionService,
  ) {}

  async list(familyId: number, query: QueryItemsDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 50, 500);
    const where = this.buildWhere(familyId, query);

    const [rows, total] = await Promise.all([
      this.prisma.item.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          quantity: true,
          price: true,
          model: true,
          manufacturer: true,
          barcode: true,
          qrToken: true,
          createdAt: true,
          location: { select: { id: true, name: true } },
          tags: { select: { id: true, name: true, color: true } },
          _count: { select: { units: true } },
        },
      }),
      this.prisma.item.count({ where }),
    ]);

    return {
      // 库存列表不返回缩略图，只给结构化数据
      items: rows.map((row) => ({
        ...row,
        price: priceNumber(row.price),
        unitCount: row._count.units,
        _count: undefined,
      })),
      total,
      page,
      pageSize,
    };
  }

  async detail(familyId: number, id: number) {
    const item = await this.prisma.item.findFirst({
      where: { id, familyId },
      include: {
        location: { select: { id: true, name: true } },
        template: { select: { id: true, name: true } },
        tags: true,
        images: true,
        coverImage: true,
        units: {
          orderBy: { id: 'asc' },
          include: { location: { select: { id: true, name: true } } },
        },
      },
    });
    if (!item) throw new NotFoundException({ code: 'item.notFound', message: '物品不存在' });

    return {
      ...item,
      price: priceNumber(item.price),
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
    const item = await this.prisma.item.create({
      data: {
        familyId,
        name: dto.name,
        description: dto.description,
        quantity: dto.quantity ?? 1,
        price: dto.price ?? 0,
        model: dto.model,
        manufacturer: dto.manufacturer,
        barcode: dto.barcode?.trim() || null,
        locationId: dto.locationId,
        templateId: dto.templateId,
        coverImageId: dto.coverImageId,
        qrToken: shortToken(),
        tags: dto.tagIds?.length ? { connect: dto.tagIds.map((id) => ({ id })) } : undefined,
        images: dto.imageIds?.length ? { connect: dto.imageIds.map((id) => ({ id })) } : undefined,
        units: dto.units?.length
          ? {
              create: dto.units.map((unit) => ({
                familyId,
                sn: unit.sn,
                locationId: unit.locationId,
                note: unit.note,
              })),
            }
          : undefined,
      },
      select: { id: true, name: true, qrToken: true },
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

    return item;
  }

  async update(familyId: number, id: number, dto: UpdateItemDto) {
    await this.mustExist(familyId, id);
    await this.assertRelations(familyId, dto);
    await this.assertBarcodeAvailable(familyId, dto.barcode, id);

    await this.prisma.item.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        quantity: dto.quantity,
        price: dto.price,
        model: dto.model,
        manufacturer: dto.manufacturer,
        barcode: dto.barcode === undefined ? undefined : dto.barcode.trim() || null,
        locationId: dto.locationId,
        coverImageId: dto.coverImageId,
        tags: dto.tagIds ? { set: dto.tagIds.map((tagId) => ({ id: tagId })) } : undefined,
        images: dto.imageIds ? { set: dto.imageIds.map((imageId) => ({ id: imageId })) } : undefined,
      },
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
    await this.prisma.item.delete({ where: { id } });
    return { ok: true };
  }

  // ---------- 序列号单元（每个 SN 可以放在不同位置） ----------

  async addUnit(familyId: number, itemId: number, dto: ItemUnitDto) {
    await this.mustExist(familyId, itemId);
    if (dto.locationId) await this.mustLocation(familyId, dto.locationId);
    if (dto.sn) await this.assertSnAvailable(familyId, dto.sn);

    return this.prisma.itemUnit.create({
      data: { familyId, itemId, sn: dto.sn, locationId: dto.locationId, note: dto.note },
    });
  }

  async updateUnit(familyId: number, itemId: number, unitId: number, dto: ItemUnitDto) {
    const unit = await this.prisma.itemUnit.findFirst({
      where: { id: unitId, itemId, familyId },
      select: { id: true },
    });
    if (!unit) throw new NotFoundException({ code: 'item.unitNotFound', message: '序列号记录不存在' });
    if (dto.locationId) await this.mustLocation(familyId, dto.locationId);
    if (dto.sn) await this.assertSnAvailable(familyId, dto.sn, unitId);

    return this.prisma.itemUnit.update({
      where: { id: unitId },
      data: { sn: dto.sn, locationId: dto.locationId, note: dto.note },
    });
  }

  async removeUnit(familyId: number, itemId: number, unitId: number) {
    const unit = await this.prisma.itemUnit.findFirst({
      where: { id: unitId, itemId, familyId },
      select: { id: true },
    });
    if (!unit) throw new NotFoundException({ code: 'item.unitNotFound', message: '序列号记录不存在' });
    await this.prisma.itemUnit.delete({ where: { id: unitId } });
    return { ok: true };
  }

  // ---------- CSV 导出（不含缩略图） ----------

  async exportCsv(familyId: number, query: QueryItemsDto) {
    const rows = await this.prisma.item.findMany({
      where: this.buildWhere(familyId, query),
      orderBy: { createdAt: 'desc' },
      include: {
        location: { select: { name: true } },
        tags: { select: { name: true } },
        units: { include: { location: { select: { name: true } } }, orderBy: { id: 'asc' } },
      },
    });

    const header = [
      '名称',
      '数量',
      '单价',
      '总价',
      '型号',
      '制造商',
      '商品条码',
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
        priceNumber(row.price).toFixed(2),
        (priceNumber(row.price) * row.quantity).toFixed(2),
        row.model ?? '',
        row.manufacturer ?? '',
        row.barcode ?? '',
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

  private buildWhere(familyId: number, query: QueryItemsDto) {
    const where: Record<string, unknown> = { familyId };

    if (query.locationId) where.locationId = query.locationId;
    if (query.tagId) where.tags = { some: { id: query.tagId } };
    if (query.sn) {
      where.units = { some: { sn: { contains: query.sn } } };
    }
    if (query.q) {
      const q = query.q;
      where.OR = [
        { name: { contains: q } },
        { barcode: { contains: q } },
        { model: { contains: q } },
        { manufacturer: { contains: q } },
        { description: { contains: q } },
        { units: { some: { sn: { contains: q } } } },
        { location: { name: { contains: q } } },
        { tags: { some: { name: { contains: q } } } },
      ];
    }

    return where;
  }

  private async mustExist(familyId: number, id: number) {
    const item = await this.prisma.item.findFirst({
      where: { id, familyId },
      select: { id: true },
    });
    if (!item) throw new NotFoundException({ code: 'item.notFound', message: '物品不存在' });
    return item;
  }

  /** 商品条码在同一个家庭内唯一 */
  private async assertBarcodeAvailable(familyId: number, barcode?: string, exceptItemId?: number) {
    const code = barcode?.trim();
    if (!code) return;

    const exists = await this.prisma.item.findFirst({
      where: { familyId, barcode: code, id: exceptItemId ? { not: exceptItemId } : undefined },
      select: { id: true },
    });
    if (exists) {
      throw new ConflictException({
        code: 'item.barcodeTaken',
        message: '该商品条码已被本家庭的其他物品使用',
      });
    }
  }

  private async mustLocation(familyId: number, locationId: number) {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, familyId },
      select: { id: true },
    });
    if (!location) throw new BadRequestException({ code: 'location.notFound', message: '位置不存在' });
  }

  private async assertSnAvailable(familyId: number, sn: string, exceptUnitId?: number) {
    const exists = await this.prisma.itemUnit.findFirst({
      where: { familyId, sn, id: exceptUnitId ? { not: exceptUnitId } : undefined },
      select: { id: true },
    });
    if (exists) throw new BadRequestException({ code: 'item.snTaken', message: '该序列号/条码已存在' });
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
      const count = await this.prisma.tag.count({ where: { familyId, id: { in: dto.tagIds } } });
      if (count !== dto.tagIds.length) {
        throw new BadRequestException({ code: 'tag.notFound', message: '标签不存在' });
      }
    }

    const imageIds = [...(dto.imageIds ?? []), ...(dto.coverImageId ? [dto.coverImageId] : [])];
    if (imageIds.length) {
      const count = await this.prisma.attachment.count({
        where: { familyId, id: { in: [...new Set(imageIds)] } },
      });
      if (count !== new Set(imageIds).size) {
        throw new BadRequestException({ code: 'upload.notFound', message: '图片不存在' });
      }
    }
  }
}

function csvCell(value: string): string {
  const text = value ?? '';
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
