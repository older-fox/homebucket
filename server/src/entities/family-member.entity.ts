import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Family } from './family.entity';
import { User } from './user.entity';

const STRING_LENGTH = 191;

/**
 * 家庭成员（用户 ↔ 家庭 的多对多连接表，带角色）。
 *
 * @@unique([familyId, userId]) —— 同一用户在同一家庭里只能有一条成员记录，
 * 这也是家庭上下文守卫按 (familyId, userId) 查成员资格的依据。
 */
@Entity('FamilyMember')
@Unique(['familyId', 'userId'])
@Index(['userId'])
export class FamilyMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  familyId: number;

  @Column({ type: 'int' })
  userId: number;

  /** owner | admin | member（用 string 而不是 enum：SQLite 不支持 enum，要保持双 provider 兼容） */
  @Column({ type: 'varchar', length: STRING_LENGTH, default: 'member' })
  role: string;

  @CreateDateColumn()
  createdAt: Date;

  // ---- 关系 ----

  @ManyToOne(() => Family, (family) => family.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'familyId' })
  family: Family;

  @ManyToOne(() => User, (user) => user.memberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
