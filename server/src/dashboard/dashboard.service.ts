import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type Repository } from 'typeorm';
import { Family } from '../entities/family.entity';
import { Item } from '../entities/item.entity';
import { ItemUnit } from '../entities/item-unit.entity';
import { Location } from '../entities/location.entity';
import { Tag } from '../entities/tag.entity';
import { countByForeignKey } from '../common/relation-count';
import { parsePackLevels } from '../items/packaging';

/** 首页概览服务（职责：聚合家庭维度的统计、最近物品、位置与标签计数） */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Family) private readonly families: Repository<Family>,
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(ItemUnit) private readonly units: Repository<ItemUnit>,
    @InjectRepository(Location) private readonly locations: Repository<Location>,
    @InjectRepository(Tag) private readonly tags: Repository<Tag>,
  ) {}

  async summary(familyId: number) {
    const [family, itemCount, locationCount, tagCount, priceRows, recentItems, locations, tags] =
      await Promise.all([
        this.families.findOne({ where: { id: familyId } }),
        this.items.count({ where: { familyId } }),
        this.locations.count({ where: { familyId } }),
        this.tags.count({ where: { familyId } }),
        // 只要金额和数量参与汇总，没必要把每条物品整行读回来
        this.items.find({ where: { familyId }, select: { price: true, quantity: true } }),
        this.items.find({
          where: { familyId },
          order: { createdAt: 'DESC' },
          take: 8,
          relations: { location: true, tags: true },
        }),
        this.locations.find({ where: { familyId }, order: { sortIndex: 'ASC', id: 'ASC' } }),
        this.tags.find({ where: { familyId }, order: { name: 'ASC' } }),
      ]);

    const recentItemIds = recentItems.map((item) => item.id);
    const locationIds = locations.map((location) => location.id);
    const tagIds = tags.map((tag) => tag.id);

    // Prisma 的 `_count` 在 TypeORM 1.x 没有等价物（loadRelationCountAndMap 已删除），
    // 单外键计数一律走 common/relation-count.ts 的聚合查询；标签是隐式多对多，
    // 没有外键列可用，单独用一次 join + GROUP BY 顶替（见 tagItemCounts）。
    const [unitCounts, childCounts, itemCountsByLocation, itemCountsByTag] = await Promise.all([
      countByForeignKey(this.units, 'itemId', recentItemIds),
      countByForeignKey(this.locations, 'parentId', locationIds),
      countByForeignKey(this.items, 'locationId', locationIds),
      this.tagItemCounts(tagIds),
    ]);

    // price 列挂了 decimal transformer，两个 provider 读回来都已经是 number（见 brief 地雷 6）
    const totalValue = priceRows.reduce((sum, row) => sum + row.price * row.quantity, 0);

    return {
      // 改造前用 select 只取这四个字段，这里显式映射，避免把整行家庭数据吐给前端
      family: family
        ? { name: family.name, currency: family.currency, locale: family.locale, timeZone: family.timeZone }
        : null,
      counts: {
        items: itemCount,
        locations: locationCount,
        tags: tagCount,
      },
      totalValue: Number(totalValue.toFixed(2)),
      recentItems: recentItems.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        baseUnit: item.baseUnit,
        packLevels: parsePackLevels(item.packLevels),
        price: item.price,
        createdAt: item.createdAt,
        location: item.location ? { id: item.location.id, name: item.location.name } : null,
        tags: item.tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color })),
        unitCount: unitCounts.get(item.id) ?? 0,
      })),
      locations: locations.map((location) => ({
        id: location.id,
        name: location.name,
        parentId: location.parentId,
        itemCount: itemCountsByLocation.get(location.id) ?? 0,
        childCount: childCounts.get(location.id) ?? 0,
      })),
      tags: tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        itemCount: itemCountsByTag.get(tag.id) ?? 0,
      })),
    };
  }

  /**
   * 统计每个标签关联了多少物品。
   *
   * `countByForeignKey` 只能按"子表上的外键列"分组，而标签与物品是多对多
   * （连接表 _ItemTags 没有对应实体），所以这里用一次 join + GROUP BY 实现，
   * 避免退化成"每个标签查一次"的 N+1。
   */
  private async tagItemCounts(tagIds: number[]): Promise<Map<number, number>> {
    if (tagIds.length === 0) return new Map();

    const rows = await this.tags
      .createQueryBuilder('tag')
      .innerJoin('tag.items', 'item')
      .select('tag.id', 'tagId')
      .addSelect('COUNT(item.id)', 'total')
      .where('tag.id IN (:...tagIds)', { tagIds })
      .groupBy('tag.id')
      .getRawMany<{ tagId: number | string; total: number | string }>();

    return new Map(rows.map((row) => [Number(row.tagId), Number(row.total)]));
  }
}
