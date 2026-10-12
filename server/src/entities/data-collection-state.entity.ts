import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { STRING_LENGTH } from './column-spec';

/**
 * 条码收集器的实例注册状态（**单例行**）。
 *
 * ── 为什么单独一张表 ──
 * 它是"整个安装一份"的凭据，不是某个用户、某个家庭的：挂在 `ApiKey` 上不对
 * （那是**入站**给脚本用的、且只存哈希），挂在 `Item` 上更不对（基数不对）。
 *
 * ── ⚠️ 这里存的是明文凭据 ──
 * 与 `ApiKey.keyHash`（只存 sha256）相反，本表的 `instanceKey` 是**明文** `hbc_<40hex>`：
 * 收集器的实例协议要求每次请求都带上这把 key 的字面值（`x-collector-key`），
 * 存哈希就没法用它发请求了。这是有意的取舍，配套三条约束：
 *   1. 任何 `/api/**` 接口都不得读取或返回 `instanceKey`；
 *   2. 日志只打 `instanceKeyPrefix`（前 12 位），不打完整 key；
 *   3. 数据库 dump 视为凭据泄露 —— 轮换方式就是清掉这一行重新注册。
 */
@Entity('DataCollectionState')
export class DataCollectionState {
  @PrimaryGeneratedColumn()
  id: number;

  /** 收集器实例凭据明文（`hbc_` + 40 位十六进制）；未注册时为 null */
  @Column({ type: 'varchar', length: 64, nullable: true })
  instanceKey: string | null;

  /** 明文前缀（形如 `hbc_1a2b3c4d`）：排障与日志只用它 */
  @Column({ type: 'varchar', length: 16, nullable: true })
  instanceKeyPrefix: string | null;

  /** 收集器那边的实例 id */
  @Column({ type: 'int', nullable: true })
  instanceId: number | null;

  /** 注册时上报的实例名（本机标识，便于在收集器后台认出自己） */
  @Column({ type: 'varchar', length: STRING_LENGTH, nullable: true })
  instanceName: string | null;

  @Column({ type: 'datetime', precision: 3, nullable: true })
  registeredAt: Date | null;

  /** 上一次跑完一轮定时上报的时间 */
  @Column({ type: 'datetime', precision: 3, nullable: true })
  lastSyncAt: Date | null;

  /** 最近一次失败的机器可读原因（如 `blocked` / `keyInvalid`），供排障与 /health */
  @Column({ type: 'varchar', length: 64, nullable: true })
  lastErrorCode: string | null;

  @Column({ type: 'datetime', precision: 3, nullable: true })
  lastErrorAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
