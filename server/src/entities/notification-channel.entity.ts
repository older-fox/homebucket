import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Family } from './family.entity';
import { STRING_LENGTH } from './column-spec';

/**
 * 通知渠道（每个家庭自己配）。
 *
 * type 取值：smtp | googlechat | telegram | discord | dingtalk | feishu | wecom | bark | serverchan
 * config / events 都存字符串：
 *   · config 是各渠道自己的 JSON 字符串（字段随 type 不同）
 *   · events 是逗号分隔的事件名，空表示订阅全部事件
 * 之所以不拆成独立列或 Json 类型，是为了同时兼容 MySQL 与 SQLite（SQLite 没有原生 JSON 列）。
 */
@Entity('NotificationChannel')
@Index(['familyId'])
export class NotificationChannel {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  familyId: number;

  @Column({ type: 'varchar', length: STRING_LENGTH })
  type: string;

  @Column({ type: 'varchar', length: STRING_LENGTH })
  name: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  /** JSON 字符串，字段因 type 而异 */
  @Column({ type: 'varchar', length: STRING_LENGTH })
  config: string;

  /** 逗号分隔的事件名；空字符串表示订阅全部 */
  @Column({ type: 'varchar', length: STRING_LENGTH, default: '' })
  events: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ---- 关系 ----

  @ManyToOne(() => Family, (family) => family.notifiers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'familyId' })
  family: Family;
}
