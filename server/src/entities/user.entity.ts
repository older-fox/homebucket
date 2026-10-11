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
import { Family } from './family.entity';
import { FamilyMember } from './family-member.entity';
import { FamilyInvite } from './family-invite.entity';
import { Attachment } from './attachment.entity';
import { ApiKey } from './api-key.entity';
import { ForeignKeyIndex } from './foreign-key-index';
import { STRING_LENGTH } from './column-spec';

/**
 * 账号。
 *
 * 注意 email 的定位变化：它只用于通知/找回，**不再作为登录凭据**（可空、可重复为空）。
 * 登录用 username。MySQL 的唯一索引允许多个 NULL，所以多用户都不填 email 是合法的。
 */
@Entity('User')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: STRING_LENGTH, nullable: true, unique: true })
  email: string | null;

  @Column({ type: 'varchar', length: STRING_LENGTH, unique: true })
  username: string;

  @Column({ type: 'varchar', length: STRING_LENGTH })
  passwordHash: string;

  @Column({ type: 'varchar', length: STRING_LENGTH, default: 'zh-CN' })
  locale: string;

  /** 用户当前选中的家庭；登录后前端会带上，用于解析家庭上下文 */
  @ForeignKeyIndex('IDX_User_defaultFamilyId')
  @Column({ type: 'int', nullable: true })
  defaultFamilyId: number | null;

  /**
   * 超期未归位提醒阈值（天）：物品被取走超过这么多天就进消息中心提醒。
   * 默认 7 天；`0` 表示关闭提醒（用户自己在前端设置）。
   */
  @Column({ type: 'int', default: 7 })
  takenOutAlertDays: number;

  /**
   * 头像附件 id；没设头像时前端回退到用户名首字母。
   *
   * 为什么不像 `Item.coverImageId` 那样声明成 `@ManyToOne` 关系（即没有数据库外键）：
   * 给**已存在**的表加外键，SQLite 只能整表重建（它没有 ALTER TABLE … ADD CONSTRAINT）。
   * 而 TypeORM 的 revert 路径是**先** `startTransaction()` 再 `beforeMigration()`
   * （node_modules/typeorm/migration/MigrationExecutor.js:317-324），此时 `PRAGMA foreign_keys = OFF`
   * 已经落在事务里、是空操作 —— 重建时 `DROP TABLE "User"` 会真的触发子表的 ON DELETE 动作与约束检查：
   * 实测报 `SqliteError: FOREIGN KEY constraint failed`（Family.ownerId 指向 User），
   * 而 foreign_keys 一旦是开的，级联删除还会顺手清掉 FamilyMember 等子表数据。
   * 既然 up 与 down 都得能在两种方言上安全跑完，这里就只存 id：
   * 完整性由服务层保证（设置头像时校验附件属于同一家庭，附件被删则视为没有头像）。
   */
  @Column({ type: 'int', nullable: true })
  avatarId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ---- 关系 ----

  @ManyToOne(() => Family, (family) => family.defaultForUsers, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'defaultFamilyId' })
  defaultFamily: Family | null;

  @OneToMany(() => FamilyMember, (member) => member.user)
  memberships: FamilyMember[];

  @OneToMany(() => Family, (family) => family.owner)
  ownedFamilies: Family[];

  @OneToMany(() => FamilyInvite, (invite) => invite.createdBy)
  createdInvites: FamilyInvite[];

  @OneToMany(() => Attachment, (attachment) => attachment.uploadedBy)
  uploads: Attachment[];

  @OneToMany(() => ApiKey, (apiKey) => apiKey.user)
  apiKeys: ApiKey[];
}
