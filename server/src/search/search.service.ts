import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, type Repository } from 'typeorm';
import { Item } from '../entities/item.entity';
import { ItemUnit } from '../entities/item-unit.entity';
import { Location } from '../entities/location.entity';
import { Tag } from '../entities/tag.entity';
import { mediaUrl } from '../common/media';
import { countByForeignKey } from '../common/relation-count';

/**
 * 全局搜索业务逻辑。
 *
 * Prisma → TypeORM 的两个注意点：
 *   · `_count` 已由 common/relation-count.ts 的聚合查询替代（TypeORM 1.x 删了 loadRelationCountAndMap）
 *   · 图片地址统一用 common/media.ts 的 mediaUrl（原先这里自带一份只拼 /api/media/<key> 的实现，
 *     会在 s3 模式下丢掉 attachment.url，共享实现同时覆盖 local / s3 两种存储）
 */
@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(Location) private readonly locations: Repository<Location>,
    @InjectRepository(Tag) private readonly tags: Repository<Tag>,
    @InjectRepository(ItemUnit) private readonly units: Repository<ItemUnit>,
  ) {}

  async search(familyId: number, rawQuery: string) {
    const q = (rawQuery ?? '').trim();
    if (!q) return { query: q, items: [], locations: [], tags: [], units: [] };

    const keyword = `%${q}%`;

    const [items, locations, tags, units] = await Promise.all([
      this.items.find({
        where: [
          { familyId, name: Like(keyword) },
          { familyId, model: Like(keyword) },
          { familyId, manufacturer: Like(keyword) },
          { familyId, description: Like(keyword) },
        ],
        take: 20,
        order: { createdAt: 'DESC' },
        relations: { location: true, tags: true },
      }),
      this.locations.find({
        where: [
          { familyId, name: Like(keyword) },
          { familyId, description: Like(keyword) },
        ],
        take: 20,
        order: { name: 'ASC' },
        relations: { image: true },
      }),
      this.tags.find({
        where: { familyId, name: Like(keyword) },
        take: 20,
        order: { name: 'ASC' },
      }),
      this.units.find({
        where: { familyId, sn: Like(keyword) },
        take: 20,
        relations: { item: true, location: true },
      }),
    ]);

    // 原 `_count: { items/children }`：Item.locationId / Location.parentId 都是外键列，
    // 直接用聚合查询（见 common/relation-count.ts）
    const [locationItemCounts, locationChildCounts, tagItemCounts] = await Promise.all([
      countByForeignKey(this.items, 'locationId', locations.map((row) => row.id)),
      countByForeignKey(this.locations, 'parentId', locations.map((row) => row.id)),
      this.countTagItems(tags.map((row) => row.id)),
    ]);

    return {
      query: q,
      // price 已是 number（实体挂了 decimal transformer），无需再 Number()
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        model: item.model,
        manufacturer: item.manufacturer,
        location: item.location ? { id: item.location.id, name: item.location.name } : null,
        tags: item.tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color })),
      })),
      locations: locations.map((location) => ({
        id: location.id,
        name: location.name,
        parentId: location.parentId,
        itemCount: locationItemCounts.get(location.id) ?? 0,
        childCount: locationChildCounts.get(location.id) ?? 0,
        imageUrl: mediaUrl(location.image),
      })),
      tags: tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        itemCount: tagItemCounts.get(tag.id) ?? 0,
      })),
      units: units.map((unit) => ({
        id: unit.id,
        sn: unit.sn,
        itemId: unit.itemId,
        item: { name: unit.item.name },
        location: unit.location ? { id: unit.location.id, name: unit.location.name } : null,
      })),
    };
  }

  /**
   * 统计每个标签关联了多少物品。
   *
   * 标签与物品是多对多（连接表 _ItemTags），Tag 上没有指向 Item 的外键列，
   * 所以 countByForeignKey 用不上（它只认子表上的外键列）。
   * 这里沿用它"一次 GROUP BY 聚合"的思路，用 join 聚合替代已删除的 `_count`，
   * 避免为了数数把每个标签的物品整行都加载出来。
   */
  private async countTagItems(tagIds: number[]): Promise<Map<number, number>> {
    if (tagIds.length === 0) return new Map();

    const rows = await this.tags
      .createQueryBuilder('tag')
      .innerJoin('tag.items', 'item')
      .select('tag.id', 'tagId')
      .addSelect('COUNT(item.id)', 'total')
      .where('tag.id IN (:...ids)', { ids: tagIds })
      .groupBy('tag.id')
      .getRawMany<{ tagId: number | string; total: number | string }>();

    return new Map(rows.map((row) => [Number(row.tagId), Number(row.total)]));
  }
}
