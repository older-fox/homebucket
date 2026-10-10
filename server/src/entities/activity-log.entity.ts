import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Family } from './family.entity';
import { STRING_LENGTH } from './column-spec';

/**
 * 操作历史（审计日志）。
 *
 * 一条记录 = 对一个物品 / 一个序列号(SN) / 一个位置的一次操作。
 * 关键设计取舍：
 *   · **不建到 Item / User 的外键**。历史必须比被操作的对象活得久——
 *     物品删除后仍要能追溯（前端据此标「已删除」），操作人删号后记录也不能跟着没。
 *     因此把物品名(itemName)、操作人名(actorName)作为**快照**存下来。
 *   · `changes` 存 JSON 字符串（不是 Json 列，SQLite 无原生 JSON 类型），
 *     形如 `[{ "field": "quantity", "from": 2, "to": 3 }]`；
 *     字段值和展示文案都在**写入时**定稿（id 已解析成位置名/标签名），
 *     这样位置/标签后来改名或删除也不影响历史可读性。
 *   · 只连 Family 一个外键：家庭删除时历史随之清理。
 */
@Entity('ActivityLog')
@Index(['familyId', 'createdAt'])
@Index(['familyId', 'itemId'])
export class ActivityLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  familyId: number;

  /** 操作人 id（快照，可空——历史上可能存在无名/已删除的操作人） */
  @Column({ type: 'int', nullable: true })
  actorId: number | null;

  /** 操作人用户名快照，保证用户删除后仍可读 */
  @Column({ type: 'varchar', length: STRING_LENGTH, default: '' })
  actorName: string;

  /** item | unit | location */
  @Column({ type: 'varchar', length: STRING_LENGTH })
  targetType: string;

  /** 被操作对象的 id（物品 id / SN 单元 id / 位置 id） */
  @Column({ type: 'int' })
  targetId: number;

  /** 归属物品 id：unit 事件也带上，便于在物品详情页把它的 SN 操作一并列出 */
  @Column({ type: 'int', nullable: true })
  itemId: number | null;

  /** 归属物品名快照：物品删除后仍可读 */
  @Column({ type: 'varchar', length: STRING_LENGTH, nullable: true })
  itemName: string | null;

  /** 事件名，取值见 activity/activity.service.ts 的 ACTIVITY_ACTIONS */
  @Column({ type: 'varchar', length: STRING_LENGTH })
  action: string;

  /** 字段级差异的 JSON 字符串；纯状态动作（取走/放回）为空 */
  @Column({ type: 'text', nullable: true })
  changes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  // ---- 关系 ----

  @ManyToOne(() => Family, (family) => family.activityLogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'familyId' })
  family: Family;
}
