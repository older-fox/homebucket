import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CatalogItem } from '../entities/catalog-item.entity';
import { Contribution } from '../entities/contribution.entity';
import { CollectorInstance } from '../entities/collector-instance.entity';
import { daysAgoIso } from '../common/time';

export interface StatsView {
  totals: {
    items: number;
    barcoded: number;
    contributions: number;
    instances: number;
    reportingInstances: number;
    lastContributionAt: string | null;
  };
  coverage: Array<{ field: string; filled: number; percent: number }>;
  /** 最近 N 天的上报量（补零，界面上直接画柱状图） */
  daily: Array<{ date: string; contributions: number }>;
  topInstances: Array<{ id: number; name: string; contributionCount: number; lastSeenAt: string | null }>;
  topManufacturers: Array<{ manufacturer: string; items: number }>;
  topCategories: Array<{ category: string; items: number }>;
}

const DAILY_DAYS = 14;
const TOP_MANUFACTURERS = 8;

/**
 * 统计概览：这个服务上"公共资料库"整体长什么样。
 *
 * 全部用聚合 SQL 现算（不缓存、不建汇总表）：数据量级在"几万物品、几十万上报"以内时，
 * SQLite 的这几条 GROUP BY 是毫秒级，而维护汇总表要处理"屏蔽上报后统计怎么回退"这种麻烦事。
 */
@Injectable()
export class StatsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async overview(): Promise<StatsView> {
    const itemRepo = this.dataSource.getRepository(CatalogItem);
    const contributionRepo = this.dataSource.getRepository(Contribution);
    const instanceRepo = this.dataSource.getRepository(CollectorInstance);

    const items = await itemRepo
      .createQueryBuilder('i')
      .where('i.mergedIntoId IS NULL')
      .getCount();
    const barcoded = await itemRepo
      .createQueryBuilder('i')
      .where('i.mergedIntoId IS NULL')
      .andWhere('i.barcode IS NOT NULL')
      .getCount();

    const usableContribution = (alias: string) =>
      `${alias}.blocked = 0 AND (${alias}.instanceId IS NULL OR ${alias}.instanceId NOT IN (SELECT id FROM CollectorInstance WHERE blocked = 1))`;

    const contributions = await contributionRepo
      .createQueryBuilder('c')
      .where(usableContribution('c'))
      .getCount();
    const instances = await instanceRepo.count();
    const reportingInstances = await instanceRepo
      .createQueryBuilder('i')
      .where('i.blocked = 0')
      .andWhere('i.contributionCount > 0')
      .getCount();

    const lastRow = await contributionRepo
      .createQueryBuilder('c')
      .select('MAX(c.observedAt)', 'last')
      .where(usableContribution('c'))
      .getRawOne<{ last: string | null }>();

    const coverageFields: Array<[string, string]> = [
      ['name', 'i.name'],
      ['model', 'i.model'],
      ['manufacturer', 'i.manufacturer'],
      ['category', 'i.category'],
      ['description', 'i.description'],
      ['imageUrls', 'i.imageUrls'],
    ];
    const coverage: StatsView['coverage'] = [];
    for (const [field, column] of coverageFields) {
      const filled = await itemRepo
        .createQueryBuilder('i')
        .where('i.mergedIntoId IS NULL')
        .andWhere(`${column} IS NOT NULL AND ${column} != ''`)
        .getCount();
      coverage.push({
        field,
        filled,
        percent: items === 0 ? 0 : Math.round((filled / items) * 100),
      });
    }

    const since = daysAgoIso(DAILY_DAYS - 1).slice(0, 10);
    const dailyRows = await contributionRepo
      .createQueryBuilder('c')
      .select("substr(c.observedAt, 1, 10)", 'date')
      .addSelect('COUNT(*)', 'n')
      .where(usableContribution('c'))
      .andWhere('substr(c.observedAt, 1, 10) >= :since', { since })
      .groupBy('substr(c.observedAt, 1, 10)')
      .getRawMany<{ date: string; n: number | string }>();
    const dailyMap = new Map(dailyRows.map((row) => [row.date, Number(row.n)]));
    const daily: StatsView['daily'] = [];
    for (let offset = DAILY_DAYS - 1; offset >= 0; offset -= 1) {
      const date = daysAgoIso(offset).slice(0, 10);
      daily.push({ date, contributions: dailyMap.get(date) ?? 0 });
    }

    const topInstances = await instanceRepo
      .createQueryBuilder('i')
      .where('i.contributionCount > 0')
      .orderBy('i.contributionCount', 'DESC')
      .addOrderBy('i.id', 'ASC')
      .limit(10)
      .getMany();

    const manufacturingRows = await itemRepo
      .createQueryBuilder('i')
      .select('i.manufacturer', 'manufacturer')
      .addSelect('COUNT(*)', 'items')
      .where('i.mergedIntoId IS NULL')
      .andWhere("i.manufacturer IS NOT NULL AND i.manufacturer != ''")
      .groupBy('i.manufacturer')
      .orderBy('items', 'DESC')
      .limit(TOP_MANUFACTURERS)
      .getRawMany<{ manufacturer: string; items: number | string }>();
    const categoryRows = await itemRepo
      .createQueryBuilder('i')
      .select('i.category', 'category')
      .addSelect('COUNT(*)', 'items')
      .where('i.mergedIntoId IS NULL')
      .andWhere("i.category IS NOT NULL AND i.category != ''")
      .groupBy('i.category')
      .orderBy('items', 'DESC')
      .limit(TOP_MANUFACTURERS)
      .getRawMany<{ category: string; items: number | string }>();

    return {
      totals: {
        items,
        barcoded,
        contributions,
        instances,
        reportingInstances,
        lastContributionAt: lastRow?.last ?? null,
      },
      coverage,
      daily,
      topInstances: topInstances.map((row: CollectorInstance) => ({
        id: row.id,
        name: row.name,
        contributionCount: row.contributionCount,
        lastSeenAt: row.lastSeenAt ?? null,
      })),
      topManufacturers: manufacturingRows.map((row) => ({
        manufacturer: row.manufacturer,
        items: Number(row.items),
      })),
      topCategories: categoryRows.map((row) => ({
        category: row.category,
        items: Number(row.items),
      })),
    };
  }
}
