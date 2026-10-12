import type { EntityManager, Repository } from 'typeorm';
import { getDataSource } from '../database/db';
import {
  AdminSession,
  AdminUser,
  CatalogItem,
  CollectorInstance,
  Contribution,
  ItemObservation,
  ObservationFeedback,
  OutboundSync,
  PhotoAsset,
  SourceWeight,
  type AdminSessionRow,
  type AdminUserRow,
  type CatalogItemRow,
  type CollectorInstanceRow,
  type ContributionRow,
  type SourceWeightRow,
  type ItemObservationRow,
  type ObservationFeedbackRow,
  type OutboundSyncRow,
  type PhotoAssetRow,
} from '../database/entities';

/**
 * 仓库访问的统一入口。
 *
 * 迁移前服务类用构造器注入（`@InjectDataSource()` + `@InjectRepository()`），
 * Nest 负责在整个进程里共享同一个 DataSource。Nitro 没有依赖注入容器，
 * 所以改成"每次用时向 database/db.ts 要当前的 DataSource"——它本身是单例，
 * 语义完全一样，还顺带让服务可以在模块加载期就构造（那时库往往还没 init）。
 *
 * 这里显式写 `getRepository<Row>(EntitySchema)` 而不是传字符串名：
 * 字符串重载在 TypeORM 的类型定义里返回 `Repository<any>`，会一路把 any 带进
 * 服务层；给 EntitySchema 加上行类型参数就能拿到 `Repository<CatalogItemRow>`。
 * 表名仍然是 'CatalogItem'，与迁移前一致。
 */
export function dataSource(): ReturnType<typeof getDataSource> {
  return getDataSource();
}

export function managerOf(manager?: EntityManager): EntityManager {
  return manager ?? getDataSource().manager;
}

export function itemsRepo(manager?: EntityManager): Repository<CatalogItemRow> {
  return managerOf(manager).getRepository<CatalogItemRow>(CatalogItem);
}

export function contributionsRepo(manager?: EntityManager): Repository<ContributionRow> {
  return managerOf(manager).getRepository<ContributionRow>(Contribution);
}

export function instancesRepo(manager?: EntityManager): Repository<CollectorInstanceRow> {
  return managerOf(manager).getRepository<CollectorInstanceRow>(CollectorInstance);
}

export function adminUsersRepo(manager?: EntityManager): Repository<AdminUserRow> {
  return managerOf(manager).getRepository<AdminUserRow>(AdminUser);
}

export function adminSessionsRepo(manager?: EntityManager): Repository<AdminSessionRow> {
  return managerOf(manager).getRepository<AdminSessionRow>(AdminSession);
}

export function observationsRepo(manager?: EntityManager): Repository<ItemObservationRow> {
  return managerOf(manager).getRepository<ItemObservationRow>(ItemObservation);
}

export function feedbackRepo(manager?: EntityManager): Repository<ObservationFeedbackRow> {
  return managerOf(manager).getRepository<ObservationFeedbackRow>(ObservationFeedback);
}

export function weightsRepo(manager?: EntityManager): Repository<SourceWeightRow> {
  return managerOf(manager).getRepository<SourceWeightRow>(SourceWeight);
}

export function photosRepo(manager?: EntityManager): Repository<PhotoAssetRow> {
  return managerOf(manager).getRepository<PhotoAssetRow>(PhotoAsset);
}

export function outboundSyncRepo(manager?: EntityManager): Repository<OutboundSyncRow> {
  return managerOf(manager).getRepository<OutboundSyncRow>(OutboundSync);
}
