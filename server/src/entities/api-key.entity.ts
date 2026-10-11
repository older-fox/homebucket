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
import { User } from './user.entity';
import { STRING_LENGTH } from './column-spec';

/**
 * API key：给脚本 / 外部程序用的只读凭据。
 *
 * ── 设计要点 ──
 *
 * 1. **归属账号，不归属家庭**：一把 key 代表它所属的那个账号，能看到的家庭与角色
 *    和该账号本人完全一致（家庭用请求头 `x-family-id` 选择，缺省回退到默认家庭）。
 *    这样「获取家庭列表并获取家庭详情」「获取当前操作角色」才说得通。
 *
 * 2. **库里不存明文**：只存 `keyHash`（明文 token 的 sha256 十六进制）。
 *    明文只在创建时返回一次，之后任何接口都拿不回来 —— 数据库泄露也换不出可用 key。
 *    与 `FamilyInvite.token`（明文列）不同是有意的：邀请链接是"拿到就能用一次"的短凭据，
 *    而 API key 是长期有效、可反复调用读接口的凭据，值得多一层哈希。
 *    代价是**无法从哈希反查明文**，所以列表接口只能显示 `prefix` 前缀。
 *
 * 3. **只读**：v1 只读接口只有 GET 路由（新增写路由时请三思），key 也不能用于应用自身的
 *    `/api/*` 写接口 —— 那些接口只认 JWT。
 *
 * 4. `revokedAt` 软撤销（保留审计痕迹），`expiresAt` 可选（空 = 永不过期），
 *    `lastUsedAt` 每次成功鉴权时更新，方便界面展示"最后使用时间"。
 */
@Entity('ApiKey')
@Index(['userId'])
export class ApiKey {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  userId: number;

  /** 人类可读的备注名，例如「Home Assistant」「备份脚本」 */
  @Column({ type: 'varchar', length: STRING_LENGTH })
  name: string;

  /**
   * 明文 token 的前缀（形如 `hb_1a2b3c4d`），仅用于界面上区分是哪一把 key。
   * 长度足够随机避免撞车，又短到不可能被误当成完整凭据。
   */
  @Column({ type: 'varchar', length: 32 })
  prefix: string;

  /** 明文 token 的 sha256 十六进制摘要（64 字符），全局唯一 */
  @Column({ type: 'varchar', length: STRING_LENGTH, unique: true })
  keyHash: string;

  /** 最后一次成功使用时间 */
  @Column({ type: 'datetime', precision: 3, nullable: true })
  lastUsedAt: Date | null;

  /** 为空表示永不过期 */
  @Column({ type: 'datetime', precision: 3, nullable: true })
  expiresAt: Date | null;

  /** 非空表示已撤销（软标记，保留审计痕迹） */
  @Column({ type: 'datetime', precision: 3, nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ---- 关系 ----

  @ManyToOne(() => User, (user) => user.apiKeys, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
