import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, type FindOptionsWhere, type Repository } from 'typeorm';
import { Tag } from '../entities/tag.entity';
import type { CreateTagDto, UpdateTagDto } from './dto';

/** 标签业务逻辑：家庭内标签的增删改查，以及"每个标签下的物品数"统计 */
@Injectable()
export class TagsService {
  constructor(@InjectRepository(Tag) private readonly tags: Repository<Tag>) {}

  async list(familyId: number) {
    const rows = await this.tags.find({ where: { familyId }, order: { name: 'ASC' } });

    // 原先由 Prisma 的 `_count: { select: { items: true } }` 提供。这里用不了
    // countByForeignKey：标签与物品是多对多，物品表上没有 tagId 外键列，
    // 只能对连接表做一次 GROUP BY 聚合，避免逐条 tag.items.length 的 N+1。
    const itemCounts = await this.countItemsByTag(rows.map((row) => row.id));

    // 显式映射：旧接口只 select 了这几个字段，别把 familyId/createdAt 吐出去
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      itemCount: itemCounts.get(row.id) ?? 0,
    }));
  }

  async create(familyId: number, dto: CreateTagDto) {
    // Prisma 的 findFirst 判存在 → repo.exists（TypeORM 1.x 是 exists 不是 exist）
    if (await this.tags.exists({ where: { familyId, name: dto.name } })) {
      throw new ConflictException({ code: 'tag.nameTaken', message: '标签名已存在' });
    }

    // color 不传时保持 undefined：TypeORM 对 undefined 会走 DEFAULT，
    // 实体上的默认色 '#14b8a6' 照旧生效（与 Prisma 省略字段的行为一致）
    const row = await this.tags.save(this.tags.create({ familyId, name: dto.name, color: dto.color }));
    return { id: row.id, name: row.name, color: row.color };
  }

  async update(familyId: number, id: number, dto: UpdateTagDto) {
    const tag = await this.mustExist(familyId, id);

    if (dto.name) {
      // 排除自身的条件只在确定有值时添加；where 里绝不能放 undefined/null，
      // TypeORM 1.x 的 invalidWhereValuesBehavior 默认 "throw" 会直接抛 TypeORMError
      const where: FindOptionsWhere<Tag> = { familyId, name: dto.name, id: Not(id) };
      if (await this.tags.exists({ where })) {
        throw new ConflictException({ code: 'tag.nameTaken', message: '标签名已存在' });
      }
    }

    // dto 里没出现的字段不动（对齐 Prisma 的 undefined = 不修改语义）
    if (dto.name !== undefined) tag.name = dto.name;
    if (dto.color !== undefined) tag.color = dto.color;
    const row = await this.tags.save(tag);
    return { id: row.id, name: row.name, color: row.color };
  }

  async remove(familyId: number, id: number) {
    await this.mustExist(familyId, id);
    await this.tags.delete({ id });
    return { ok: true };
  }

  /** 标签必须属于当前家庭，否则 404（所有标签查询都带 familyId 做租户隔离） */
  private async mustExist(familyId: number, id: number): Promise<Tag> {
    const row = await this.tags.findOne({ where: { id, familyId } });
    if (!row) throw new NotFoundException({ code: 'tag.notFound', message: '标签不存在' });
    return row;
  }

  /** 每个标签下的物品数：多对多没有外键列，只能按连接表分组聚合（一次查询） */
  private async countItemsByTag(ids: number[]): Promise<Map<number, number>> {
    if (ids.length === 0) return new Map();

    const rows = await this.tags
      .createQueryBuilder('tag')
      .innerJoin('tag.items', 'item')
      .select('tag.id', 'tagId')
      .addSelect('COUNT(item.id)', 'total')
      .where('tag.id IN (:...ids)', { ids })
      .groupBy('tag.id')
      .getRawMany<{ tagId: number | string; total: number | string }>();

    return new Map(rows.map((row) => [Number(row.tagId), Number(row.total)]));
  }
}
