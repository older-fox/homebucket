import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, type FindOptionsWhere, type Repository } from 'typeorm';
import { ActivityLog } from '../entities/activity-log.entity';
import { normalizePaging } from '../common/pagination';

/** 记录哪些操作（与 notifiers 的 NOTIFIER_EVENTS 同样是集中式事件名注册表） */
export const ACTIVITY_ACTIONS = [
  'item.create',
  'item.update',
  'item.delete',
  'item.take_out',
  'item.put_back',
  'item.consume',
  'item.restock',
  'item.unpack',
  'unit.create',
  'unit.update',
  'unit.delete',
  'location.create',
  'location.update',
  'location.move',
  'location.delete',
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];
export type ActivityTargetType = 'item' | 'unit' | 'location';

/** 操作人：id + 用户名快照（用户名单独存，避免用户删除后历史不可读） */
export interface ActivityActor {
  id: number;
  name: string;
}

/**
 * 字段级差异的一项。
 * from/to 在**写入时**就已解析成可直接展示的值（位置名、标签名数组、数量……）；
 * `null` 分别表示"新增时无旧值"和"删除时无新值"。
 */
export interface ActivityChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface ActivityEvent {
  targetType: ActivityTargetType;
  targetId: number;
  action: ActivityAction;
  /** 归属物品 id：unit 事件也带上，物品详情页据此聚合它的 SN 操作 */
  itemId?: number | null;
  /** 归属物品名快照（物品删除后仍可读） */
  itemName?: string | null;
  changes?: ActivityChange[];
}

export interface ActivityEntry {
  id: number;
  action: string;
  targetType: string;
  targetId: number;
  itemId: number | null;
  itemName: string | null;
  actorId: number | null;
  actorName: string;
  changes: ActivityChange[];
  createdAt: Date;
}

export interface ActivityQuery {
  page?: number;
  pageSize?: number;
  targetType?: string;
}

/**
 * 比较两个"已解析成展示值"的对象，返回发生变化的字段。
 *
 * - 数组/对象按 JSON 比较（本项目的差异值都是基本类型或名字数组，够用）
 * - 缺失的值统一归一成 null：新增 from=null，删除 to=null
 * - 返回空数组表示无变化，调用方（update 之类）据此跳过记录，避免无意义流水
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): ActivityChange[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: ActivityChange[] = [];
  for (const field of keys) {
    const from = before[field] ?? null;
    const to = after[field] ?? null;
    if (sameValue(from, to)) continue;
    changes.push({ field, from, to });
  }
  return changes;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/** 解析存储的 changes JSON；损坏/为空一律回退成空数组，不让一条坏数据打挂整页 */
function parseChanges(raw: string | null): ActivityChange[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ActivityChange[]) : [];
  } catch {
    return [];
  }
}

@Injectable()
export class ActivityService {
  constructor(@InjectRepository(ActivityLog) private readonly logs: Repository<ActivityLog>) {}

  /**
   * 写入一条历史。传入 `manager` 时会用**当前事务**的仓库，
   * 使"业务变更 + 历史"原子提交（审计不丢行）。
   */
  async record(
    familyId: number,
    actor: ActivityActor,
    event: ActivityEvent,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(ActivityLog) : this.logs;
    await repo.insert({
      familyId,
      actorId: actor.id,
      actorName: actor.name,
      targetType: event.targetType,
      targetId: event.targetId,
      itemId: event.itemId ?? null,
      itemName: event.itemName ?? null,
      action: event.action,
      changes: event.changes?.length ? JSON.stringify(event.changes) : null,
    });
  }

  /** 家庭级流水（可按 targetType 过滤），按时间倒序分页 */
  async list(familyId: number, query: ActivityQuery) {
    const where: FindOptionsWhere<ActivityLog> = { familyId };
    // 只有确实传了值才放进 where：TypeORM 1.x 遇到 undefined 会直接抛错
    if (query.targetType) where.targetType = query.targetType;
    return this.page(where, query);
  }

  /** 单个物品的历史：物品自身 + 它名下 SN 的操作都计入 */
  async listForItem(familyId: number, itemId: number, query: ActivityQuery) {
    return this.page({ familyId, itemId }, query);
  }

  private async page(where: FindOptionsWhere<ActivityLog>, query: ActivityQuery) {
    const { page, pageSize, skip } = normalizePaging(query.page, query.pageSize);
    const [rows, total] = await this.logs.findAndCount({
      where,
      // id 兜底：同一毫秒内的多条也要有稳定顺序，分页才不会漏/重
      order: { createdAt: 'DESC', id: 'DESC' },
      skip,
      take: pageSize,
    });

    return {
      items: rows.map(
        (row): ActivityEntry => ({
          id: row.id,
          action: row.action,
          targetType: row.targetType,
          targetId: row.targetId,
          itemId: row.itemId,
          itemName: row.itemName,
          actorId: row.actorId,
          actorName: row.actorName,
          changes: parseChanges(row.changes),
          createdAt: row.createdAt,
        }),
      ),
      total,
      page,
      pageSize,
    };
  }
}
