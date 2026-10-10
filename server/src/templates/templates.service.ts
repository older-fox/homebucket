import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, type FindOptionsWhere, type Repository } from 'typeorm';
import { Attachment } from '../entities/attachment.entity';
import { Item } from '../entities/item.entity';
import { Location } from '../entities/location.entity';
import { Tag } from '../entities/tag.entity';
import { Template } from '../entities/template.entity';
import { ActivityService, diffFields, type ActivityActor } from '../activity/activity.service';
import {
  normalizePackLevels,
  normalizePackaging,
  packLevelsLabel,
  parsePackLevels,
  serializePackLevels,
} from '../items/packaging';
import { shortToken } from '../common/id';
import { mediaUrl } from '../common/media';
import { countByForeignKey } from '../common/relation-count';
import type { CreateTemplateDto, UpdateTemplateDto, UseTemplateDto } from './dto';

/** 模板业务逻辑：模板 CRUD、模板条码唯一性校验，以及"用模板快速新增物品" */
@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(Template) private readonly templates: Repository<Template>,
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(Location) private readonly locations: Repository<Location>,
    @InjectRepository(Tag) private readonly tags: Repository<Tag>,
    @InjectRepository(Attachment) private readonly attachments: Repository<Attachment>,
    private readonly activity: ActivityService,
  ) {}

  async list(familyId: number) {
    const rows = await this.templates.find({
      where: { familyId },
      order: { name: 'ASC' },
      // relations 只支持对象语法（字符串数组写法在 1.x 已移除）；会加载关系整行，
      // 所以下面 toDetail 里显式映射字段，保持响应结构与改造前一致
      relations: { image: true, defaultLocation: true, tags: true },
    });

    // 原先由 Prisma 的 `_count: { select: { items: true } }` 提供；TypeORM 1.x 删了
    // loadRelationCountAndMap（见 common/relation-count.ts 的说明），用一次聚合查询顶替
    const itemCounts = await countByForeignKey(this.items, 'templateId', rows.map((row) => row.id));
    return rows.map((row) => this.toDetail(row, itemCounts.get(row.id) ?? 0));
  }

  /** 单个模板详情：创建物品时用来预填表单 */
  async detail(familyId: number, id: number) {
    const row = await this.templates.findOne({
      where: { id, familyId },
      relations: { image: true, defaultLocation: true, tags: true },
    });
    if (!row) throw new NotFoundException({ code: 'template.notFound', message: '模板不存在' });

    // 单个模板的物品数同样走 countByForeignKey，保持与列表一致的取数路径
    const itemCounts = await countByForeignKey(this.items, 'templateId', [row.id]);
    return this.toDetail(row, itemCounts.get(row.id) ?? 0);
  }

  /**
   * 统一的详情映射：旧接口用 select 窄化过关系字段，TypeORM 的 relations 会加载整行，
   * 这里显式挑出原字段，避免多吐 familyId / qrToken 之类的内容。
   */
  private toDetail(row: Template, itemCount: number) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      imageId: row.imageId,
      imageUrl: mediaUrl(row.image),
      barcode: row.barcode,
      quantity: row.quantity,
      baseUnit: row.baseUnit,
      packLevels: parsePackLevels(row.packLevels),
      // price 实体上挂了 decimal transformer，已经是 number，不用再 Number()
      price: row.price,
      model: row.model,
      manufacturer: row.manufacturer,
      defaultLocationId: row.defaultLocationId,
      defaultLocation: row.defaultLocation
        ? { id: row.defaultLocation.id, name: row.defaultLocation.name }
        : null,
      tags: row.tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color })),
      itemCount,
    };
  }

  async create(familyId: number, dto: CreateTemplateDto) {
    await this.assertRelations(familyId, dto);
    await this.assertBarcodeAvailable(familyId, dto.barcode);

    const packaging = normalizePackaging(dto.baseUnit, dto.packLevels);
    const row = await this.templates.save(
      this.templates.create({
        familyId,
        name: dto.name,
        description: dto.description ?? null,
        imageId: dto.imageId ?? null,
        quantity: dto.quantity ?? 1,
        baseUnit: packaging.baseUnit,
        packLevels: packaging.packLevels,
        price: dto.price ?? 0,
        model: dto.model ?? null,
        manufacturer: dto.manufacturer ?? null,
        barcode: dto.barcode?.trim() || null,
        defaultLocationId: dto.defaultLocationId ?? null,
        // 多对多的拥有方在 Template 上，save 会一并写入 _TemplateTags 连接行
        tags: dto.tagIds?.length ? await this.tags.findBy({ id: In(dto.tagIds), familyId }) : [],
      }),
    );
    return { id: row.id };
  }

  async update(familyId: number, id: number, dto: UpdateTemplateDto) {
    const row = await this.mustExist(familyId, id);
    await this.assertRelations(familyId, dto);
    await this.assertBarcodeAvailable(familyId, dto.barcode, id);

    // 只覆盖 dto 里出现过的字段（对齐 Prisma 的 undefined = 不修改语义），
    // updatedAt 由 @UpdateDateColumn 在 save 时自动维护
    if (dto.name !== undefined) row.name = dto.name;
    if (dto.description !== undefined) row.description = dto.description;
    if (dto.imageId !== undefined) row.imageId = dto.imageId;
    if (dto.quantity !== undefined) row.quantity = dto.quantity;
    if (dto.baseUnit !== undefined || dto.packLevels !== undefined) {
      const nextBase = dto.baseUnit !== undefined ? dto.baseUnit?.trim() || null : row.baseUnit;
      if (dto.packLevels !== undefined) {
        row.packLevels = serializePackLevels(normalizePackLevels(dto.packLevels));
      }
      row.baseUnit = nextBase;
      if (!nextBase) row.packLevels = null;
    }
    if (dto.price !== undefined) row.price = dto.price;
    if (dto.model !== undefined) row.model = dto.model;
    if (dto.manufacturer !== undefined) row.manufacturer = dto.manufacturer;
    if (dto.barcode !== undefined) row.barcode = dto.barcode.trim() || null;
    if (dto.defaultLocationId !== undefined) row.defaultLocationId = dto.defaultLocationId;
    // Prisma 的 `set` 是整体替换：传空数组即清空标签
    if (dto.tagIds !== undefined) {
      row.tags = dto.tagIds.length ? await this.tags.findBy({ id: In(dto.tagIds), familyId }) : [];
    }

    await this.templates.save(row);
    return { id };
  }

  async remove(familyId: number, id: number) {
    await this.mustExist(familyId, id);
    await this.templates.delete({ id });
    return { ok: true };
  }

  /** 用模板快速新增物品：模板字段作为默认值，允许覆盖；记一条 item.create（含来源模板） */
  async createItem(familyId: number, actor: ActivityActor, id: number, dto: UseTemplateDto) {
    const template = await this.templates.findOne({
      where: { id, familyId },
      relations: { tags: true },
    });
    if (!template) throw new NotFoundException({ code: 'template.notFound', message: '模板不存在' });

    if (dto.locationId) {
      const exists = await this.locations.exists({ where: { id: dto.locationId, familyId } });
      if (!exists) throw new BadRequestException({ code: 'location.notFound', message: '位置不存在' });
    }

    const name = dto.name?.trim() || template.name;
    const locationId = dto.locationId ?? template.defaultLocationId;
    const locationName = locationId
      ? ((await this.locations.findOne({ where: { id: locationId, familyId }, select: { name: true } }))?.name ?? null)
      : null;

    const changes = diffFields({}, {
      name,
      description: template.description ?? null,
      quantity: dto.quantity ?? template.quantity,
      price: template.price,
      model: template.model ?? null,
      manufacturer: template.manufacturer ?? null,
      location: locationName,
      tags: template.tags.map((tag) => tag.name).sort(),
      baseUnit: template.baseUnit ?? null,
      packLevels: packLevelsLabel(parsePackLevels(template.packLevels)),
      // 记下"从哪个模板来"，便于追溯
      template: template.name,
    });

    const row = await this.items.manager.transaction(async (manager) => {
      const saved = await manager.save(
        manager.create(Item, {
          familyId,
          name,
          description: template.description,
          quantity: dto.quantity ?? template.quantity,
          price: template.price,
          model: template.model,
          manufacturer: template.manufacturer,
          locationId,
          templateId: template.id,
          coverImageId: template.imageId,
          // 包装规格随模板带到物品上
          baseUnit: template.baseUnit,
          packLevels: template.packLevels,
          qrToken: shortToken(),
          // 模板标签整体带过来（Prisma 的嵌套 connect），连接行由 save 写入
          tags: template.tags,
        }),
      );

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

    return { id: row.id, name: row.name };
  }

  /** 模板条码在同一家庭内唯一 */
  private async assertBarcodeAvailable(familyId: number, barcode?: string, exceptId?: number) {
    const code = barcode?.trim();
    if (!code) return;

    // 地雷：不能写成 `id: exceptId ? Not(exceptId) : undefined` ——
    // TypeORM 1.x 的 invalidWhereValuesBehavior 默认 "throw"，where 里的 undefined 会直接抛错。
    // 只有 exceptId 有值时才把"排除自身"的条件放进 where。
    const where: FindOptionsWhere<Template> = { familyId, barcode: code };
    if (exceptId) where.id = Not(exceptId);

    if (await this.templates.exists({ where })) {
      throw new ConflictException({
        code: 'template.barcodeTaken',
        message: '该商品条码已被其他模板使用',
      });
    }
  }

  /** 模板必须属于当前家庭，否则 404；返回实体供 update 直接改字段后 save */
  private async mustExist(familyId: number, id: number): Promise<Template> {
    const row = await this.templates.findOne({ where: { id, familyId } });
    if (!row) throw new NotFoundException({ code: 'template.notFound', message: '模板不存在' });
    return row;
  }

  /** 创建/更新前校验关联资源归属同一个家庭（错误 code 与改造前一致） */
  private async assertRelations(
    familyId: number,
    dto: { defaultLocationId?: number; tagIds?: number[]; imageId?: number },
  ) {
    if (dto.defaultLocationId) {
      const exists = await this.locations.exists({ where: { id: dto.defaultLocationId, familyId } });
      if (!exists) throw new BadRequestException({ code: 'location.notFound', message: '位置不存在' });
    }
    if (dto.tagIds?.length) {
      const count = await this.tags.count({ where: { familyId, id: In(dto.tagIds) } });
      if (count !== dto.tagIds.length) {
        throw new BadRequestException({ code: 'tag.notFound', message: '标签不存在' });
      }
    }
    if (dto.imageId) {
      const count = await this.attachments.count({ where: { familyId, id: dto.imageId } });
      if (!count) throw new BadRequestException({ code: 'upload.notFound', message: '图片不存在' });
    }
  }
}
