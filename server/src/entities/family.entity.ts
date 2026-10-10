import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { FamilyMember } from './family-member.entity';
import { FamilyInvite } from './family-invite.entity';
import { Location } from './location.entity';
import { Item } from './item.entity';
import { ItemUnit } from './item-unit.entity';
import { Tag } from './tag.entity';
import { Template } from './template.entity';
import { Attachment } from './attachment.entity';
import { NotificationChannel } from './notification-channel.entity';
import { ActivityLog } from './activity-log.entity';
import { ForeignKeyIndex } from './foreign-key-index';
import { STRING_LENGTH } from './column-spec';

/**
 * 家庭（数据边界）。
 *
 * 用户注册时自动创建一个 isPersonal 的个人家庭；接受邀请后会加入更多家庭。
 * 所有业务查询都必须用 familyId 硬过滤，保证多家庭之间数据隔离。
 *
 * 表名显式写成 'Family'：TypeORM 的默认命名策略会把类名转成 snake_case（family），
 * 而现有库是 Prisma 建的表，名字就是驼峰。不显式指定会直接读不到表。
 */
@Entity('Family')
export class Family {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: STRING_LENGTH })
  name: string;

  @Column({ type: 'varchar', length: STRING_LENGTH, default: 'CNY' })
  currency: string;

  @Column({ type: 'varchar', length: STRING_LENGTH, default: 'zh-CN' })
  locale: string;

  @Column({ type: 'varchar', length: STRING_LENGTH, default: 'Asia/Shanghai' })
  timeZone: string;

  @Column({ type: 'boolean', default: false })
  isPersonal: boolean;

  @ForeignKeyIndex('IDX_Family_ownerId')
  @Column({ type: 'int' })
  ownerId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ---- 关系 ----

  /** 创建者。必填关系，删除用户时拒绝（RESTRICT），与旧库约束一致 */
  @ManyToOne(() => User, (user) => user.ownedFamilies, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @OneToMany(() => FamilyMember, (member) => member.family)
  members: FamilyMember[];

  @OneToMany(() => FamilyInvite, (invite) => invite.family)
  invites: FamilyInvite[];

  @OneToMany(() => Location, (location) => location.family)
  locations: Location[];

  @OneToMany(() => Item, (item) => item.family)
  items: Item[];

  @OneToMany(() => ItemUnit, (unit) => unit.family)
  itemUnits: ItemUnit[];

  @OneToMany(() => Tag, (tag) => tag.family)
  tags: Tag[];

  @OneToMany(() => Template, (template) => template.family)
  templates: Template[];

  @OneToMany(() => Attachment, (attachment) => attachment.family)
  attachments: Attachment[];

  @OneToMany(() => NotificationChannel, (channel) => channel.family)
  notifiers: NotificationChannel[];

  /** 操作历史（家庭删除时一并清理） */
  @OneToMany(() => ActivityLog, (log) => log.family)
  activityLogs: ActivityLog[];

  /** 把本家庭当作默认家庭的用户（User.defaultFamilyId 的反向） */
  @OneToMany(() => User, (user) => user.defaultFamily)
  defaultForUsers: User[];
}
