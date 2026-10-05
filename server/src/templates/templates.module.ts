import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentFamily, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import { PrismaService } from '../prisma/prisma.service';
import { shortToken } from '../common/id';
import { CreateTemplateDto, UpdateTemplateDto, UseTemplateDto } from './dto';

const mediaUrl = (attachment: { key: string; url: string | null } | null) =>
  attachment ? attachment.url || `/api/media/${attachment.key}` : null;

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(familyId: number) {
    const rows = await this.prisma.template.findMany({
      where: { familyId },
      orderBy: { name: 'asc' },
      include: {
        image: { select: { key: true, url: true } },
        defaultLocation: { select: { id: true, name: true } },
        tags: { select: { id: true, name: true, color: true } },
        _count: { select: { items: true } },
      },
    });

    return rows.map((row) => this.toDetail(row));
  }

  /** 单个模板详情：创建物品时用来预填表单 */
  async detail(familyId: number, id: number) {
    const row = await this.prisma.template.findFirst({
      where: { id, familyId },
      include: {
        image: { select: { key: true, url: true } },
        defaultLocation: { select: { id: true, name: true } },
        tags: { select: { id: true, name: true, color: true } },
        _count: { select: { items: true } },
      },
    });
    if (!row) throw new NotFoundException({ code: 'template.notFound', message: '模板不存在' });
    return this.toDetail(row);
  }

  private toDetail(row: {
    id: number;
    name: string;
    description: string | null;
    imageId: number | null;
    barcode: string | null;
    image: { key: string; url: string | null } | null;
    quantity: number;
    price: unknown;
    model: string | null;
    manufacturer: string | null;
    defaultLocationId: number | null;
    defaultLocation: { id: number; name: string } | null;
    tags: { id: number; name: string; color: string }[];
    _count: { items: number };
  }) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      imageId: row.imageId,
      imageUrl: mediaUrl(row.image),
      barcode: row.barcode,
      quantity: row.quantity,
      price: Number(row.price),
      model: row.model,
      manufacturer: row.manufacturer,
      defaultLocationId: row.defaultLocationId,
      defaultLocation: row.defaultLocation,
      tags: row.tags,
      itemCount: row._count.items,
    };
  }

  async create(familyId: number, dto: CreateTemplateDto) {
    await this.assertRelations(familyId, dto);
    await this.assertBarcodeAvailable(familyId, dto.barcode);
    const row = await this.prisma.template.create({
      data: {
        familyId,
        name: dto.name,
        description: dto.description,
        imageId: dto.imageId,
        quantity: dto.quantity ?? 1,
        price: dto.price ?? 0,
        model: dto.model,
        manufacturer: dto.manufacturer,
        barcode: dto.barcode?.trim() || null,
        defaultLocationId: dto.defaultLocationId,
        tags: dto.tagIds?.length ? { connect: dto.tagIds.map((id) => ({ id })) } : undefined,
      },
      select: { id: true },
    });
    return row;
  }

  async update(familyId: number, id: number, dto: UpdateTemplateDto) {
    await this.mustExist(familyId, id);
    await this.assertRelations(familyId, dto);
    await this.assertBarcodeAvailable(familyId, dto.barcode, id);
    await this.prisma.template.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        imageId: dto.imageId,
        quantity: dto.quantity,
        price: dto.price,
        model: dto.model,
        manufacturer: dto.manufacturer,
        barcode: dto.barcode === undefined ? undefined : dto.barcode.trim() || null,
        defaultLocationId: dto.defaultLocationId,
        tags: dto.tagIds ? { set: dto.tagIds.map((tagId) => ({ id: tagId })) } : undefined,
      },
    });
    return { id };
  }

  async remove(familyId: number, id: number) {
    await this.mustExist(familyId, id);
    await this.prisma.template.delete({ where: { id } });
    return { ok: true };
  }

  /** 用模板快速新增物品：模板字段作为默认值，允许覆盖 */
  async createItem(familyId: number, id: number, dto: UseTemplateDto) {
    const template = await this.prisma.template.findFirst({
      where: { id, familyId },
      include: { tags: { select: { id: true } } },
    });
    if (!template) throw new NotFoundException({ code: 'template.notFound', message: '模板不存在' });

    if (dto.locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: dto.locationId, familyId },
        select: { id: true },
      });
      if (!location) throw new BadRequestException({ code: 'location.notFound', message: '位置不存在' });
    }

    return this.prisma.item.create({
      data: {
        familyId,
        name: dto.name?.trim() || template.name,
        description: template.description,
        quantity: dto.quantity ?? template.quantity,
        price: template.price,
        model: template.model,
        manufacturer: template.manufacturer,
        locationId: dto.locationId ?? template.defaultLocationId,
        templateId: template.id,
        coverImageId: template.imageId,
        qrToken: shortToken(),
        tags: template.tags.length ? { connect: template.tags.map((tag) => ({ id: tag.id })) } : undefined,
      },
      select: { id: true, name: true },
    });
  }

  /** 模板条码在同一家庭内唯一 */
  private async assertBarcodeAvailable(familyId: number, barcode?: string, exceptId?: number) {
    const code = barcode?.trim();
    if (!code) return;

    const exists = await this.prisma.template.findFirst({
      where: { familyId, barcode: code, id: exceptId ? { not: exceptId } : undefined },
      select: { id: true },
    });
    if (exists) {
      throw new ConflictException({
        code: 'template.barcodeTaken',
        message: '该商品条码已被其他模板使用',
      });
    }
  }

  private async mustExist(familyId: number, id: number) {
    const row = await this.prisma.template.findFirst({ where: { id, familyId }, select: { id: true } });
    if (!row) throw new NotFoundException({ code: 'template.notFound', message: '模板不存在' });
  }

  private async assertRelations(
    familyId: number,
    dto: { defaultLocationId?: number; tagIds?: number[]; imageId?: number },
  ) {
    if (dto.defaultLocationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: dto.defaultLocationId, familyId },
        select: { id: true },
      });
      if (!location) throw new BadRequestException({ code: 'location.notFound', message: '位置不存在' });
    }
    if (dto.tagIds?.length) {
      const count = await this.prisma.tag.count({ where: { familyId, id: { in: dto.tagIds } } });
      if (count !== dto.tagIds.length) {
        throw new BadRequestException({ code: 'tag.notFound', message: '标签不存在' });
      }
    }
    if (dto.imageId) {
      const count = await this.prisma.attachment.count({ where: { familyId, id: dto.imageId } });
      if (!count) throw new BadRequestException({ code: 'upload.notFound', message: '图片不存在' });
    }
  }
}

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @FamilyScoped()
  @Get()
  list(@CurrentFamily() family: FamilyContext) {
    return this.templates.list(family.id);
  }

  @FamilyScoped()
  @Get(':id')
  detail(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.templates.detail(family.id, id);
  }

  @FamilyScoped()
  @Post()
  create(@CurrentFamily() family: FamilyContext, @Body() dto: CreateTemplateDto) {
    return this.templates.create(family.id, dto);
  }

  @FamilyScoped()
  @Patch(':id')
  update(
    @CurrentFamily() family: FamilyContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templates.update(family.id, id, dto);
  }

  @FamilyScoped()
  @Delete(':id')
  remove(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.templates.remove(family.id, id);
  }

  @FamilyScoped()
  @Post(':id/items')
  createItem(
    @CurrentFamily() family: FamilyContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UseTemplateDto,
  ) {
    return this.templates.createItem(family.id, id, dto);
  }
}

@Module({
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
