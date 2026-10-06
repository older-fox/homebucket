import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Family } from './family.entity';
import { User } from './user.entity';

const STRING_LENGTH = 191;

/**
 * 家庭邀请链接。
 *
 * token 人人可用（拿到链接就能加入），可设过期时间，owner 可以撤销（revokedAt 非空）。
 * 撤销用 revokedAt 软标记而不是删除，保留审计痕迹。
 */
@Entity('FamilyInvite')
@Index(['familyId'])
export class FamilyInvite {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  familyId: number;

  @Column({ type: 'varchar', length: STRING_LENGTH, unique: true })
  token: string;

  @Column({ type: 'int' })
  createdById: number;

  /** 为空表示永不过期 */
  @Column({ type: 'datetime', precision: 3, nullable: true })
  expiresAt: Date | null;

  /** 非空表示已撤销 */
  @Column({ type: 'datetime', precision: 3, nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  // ---- 关系 ----

  @ManyToOne(() => Family, (family) => family.invites, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'familyId' })
  family: Family;

  @ManyToOne(() => User, (user) => user.createdInvites, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;
}
