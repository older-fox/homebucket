import { CatalogItem } from './catalog-item.entity';
import { CollectorInstance } from './collector-instance.entity';
import { Contribution } from './contribution.entity';

/**
 * 全部实体（唯一来源）。
 * 显式列出而不用 autoLoadEntities / 目录 glob：迁移 CLI、运行时连接与测试
 * 都要同一份清单，写死最省事也不会漏。
 */
export const entities = [CatalogItem, Contribution, CollectorInstance];

export { CatalogItem, CollectorInstance, Contribution };
