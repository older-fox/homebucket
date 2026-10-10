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
import { ForeignKeyIndex } from './foreign-key-index';

const STRING_LENGTH = 191;

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
}
