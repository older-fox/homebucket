import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { alive } from '../common/soft-delete';
import { Item } from '../entities/item.entity';
import { ItemUnit } from '../entities/item-unit.entity';
import { User } from '../entities/user.entity';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 一条「取走过久」提醒：整件取走的记在物品上，按件追踪的记在件上 */
export interface OverdueEntry {
  kind: 'item' | 'unit';
  itemId: number;
  itemName: string;
  unitId: number | null;
  sn: string | null;
  location: { id: number; name: string } | null;
  takenOutAt: string;
  /** 已取走多少天（向下取整） */
  days: number;
}

/**
 * 消息中心（当前只有「取走过久未归位」一类）。
 *
 * 没有 scheduler、没有「已读」状态表：登录后前端拉一次、需要时再拉一次即可，
 * 提醒是**按需计算**出来的视图，不是需要后台维护的队列。
 *
 * 仓库里后来确实有了 @nestjs/schedule，但**只有 src/collection/ 用**（条码全量上报）。
 * 那边能接受定时任务是因为它幂等：收集器按"实例 + 内容指纹"去重，本地每物品还留了
 * 上报时间戳，多实例或重跑一轮都不会重复记账。通知这边没有这种幂等保障，
 * 加定时任务就要处理多实例重复推送，所以继续保持按需计算。
 */
@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(ItemUnit) private readonly units: Repository<ItemUnit>,
  ) {}

  /**
   * 取走过久清单。
   *
   * 阈值是**账号级**设置（User.takenOutAlertDays）：0 表示用户主动关掉提醒，
   * 返回 enabled:false 而不是报错。已遗失（lostAt 非空）的东西不再催 —— 那是
   * 「确认找不回来」，跟「拿走忘了放回」是两码事。
   */
  async overdue(familyId: number, userId: number) {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, takenOutAlertDays: true },
    });
    const thresholdDays = user?.takenOutAlertDays ?? 0;
    const generatedAt = new Date().toISOString();
    if (thresholdDays <= 0) {
      return { enabled: false, thresholdDays: 0, generatedAt, count: 0, entries: [] as OverdueEntry[] };
    }

    const cutoff = new Date(Date.now() - thresholdDays * DAY_MS);
    const [itemRows, unitRows] = await Promise.all([
      // 整件追踪（没有 SN）的物品：取走状态直接记在物品行上
      this.items.find({
        where: { familyId, ...alive(), lostAt: IsNull(), takenOutAt: LessThanOrEqual(cutoff) },
        relations: { location: true },
        order: { takenOutAt: 'ASC' },
      }),
      // 按件追踪的物品：取走的是具体某一件，物品行的 takenOutAt 仍是 null
      this.units.find({
        where: { familyId, ...alive(), lostAt: IsNull(), takenOutAt: LessThanOrEqual(cutoff) },
        relations: { item: true, location: true },
        order: { takenOutAt: 'ASC' },
      }),
    ]);

    const entries: OverdueEntry[] = [
      ...itemRows.flatMap<OverdueEntry>((row) => {
        if (!row.takenOutAt) return [];
        return [
          {
            kind: 'item',
            itemId: row.id,
            itemName: row.name,
            unitId: null,
            sn: null,
            location: row.location ? { id: row.location.id, name: row.location.name } : null,
            takenOutAt: row.takenOutAt.toISOString(),
            days: this.daysSince(row.takenOutAt),
          },
        ];
      }),
      ...unitRows.flatMap<OverdueEntry>((row) => {
        // 物品自己被软删除或被标遗失时，它名下的件也不该再提醒
        if (!row.takenOutAt || row.item.deletedAt || row.item.lostAt) return [];
        return [
          {
            kind: 'unit',
            itemId: row.itemId,
            itemName: row.item.name,
            unitId: row.id,
            sn: row.sn,
            location: row.location ? { id: row.location.id, name: row.location.name } : null,
            takenOutAt: row.takenOutAt.toISOString(),
            days: this.daysSince(row.takenOutAt),
          },
        ];
      }),
    ].sort((a, b) => b.days - a.days);

    return { enabled: true, thresholdDays, generatedAt, count: entries.length, entries };
  }

  private daysSince(at: Date): number {
    return Math.max(0, Math.floor((Date.now() - at.getTime()) / DAY_MS));
  }
}
