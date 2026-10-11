import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { LENGTH } from './column-spec';

/**
 * 一个上报方：某台 HomeBucket 实例（或某个接入收集器协议的集成）。
 *
 * ── 为什么是"自我注册"，不是人工签发 ──
 * 需求是"上报是自动的，实例是所有人运行的所有实例"：任何人都能装一个 HomeBucket，
 * 它第一次联网时就该能上报，不该等管理员发凭据。所以实例调一次
 * `POST /api/v1/instances` 自己领一把 key，存在本地配置里，之后一直用它。
 * 这样做的代价是任何人都能注册，好处是**每条上报都能追溯到具体实例**，
 * 于是"来源审计 / 屏蔽某条脏数据 / 封禁刷量实例"才成立 —— 光靠 IP 做不到这些。
 *
 * ── 凭据存储 ──
 * 只存 sha256（与 HomeBucket 的 API key 同一套思路）：数据库泄露不等于凭据泄露。
 * 明文只在注册响应里出现一次，之后任何接口都拿不回来，列表只显示 keyPrefix。
 *
 * ── 与 HomeBucket 的 ApiKey 的区别 ──
 * 这里没有"账号下多把 key"的层级：一个实例就是一把 key。要轮换就重新注册一个实例，
 * 老实例封禁即可，历史上报仍挂在老 id 上，审计链不断。
 */
@Entity('CollectorInstance')
@Index(['blocked'])
export class CollectorInstance {
  @PrimaryGeneratedColumn()
  id: number;

  /** 实例自报的名字（默认取主机名），便于在纠错台里认出是谁 */
  @Column({ type: 'varchar', length: LENGTH.instanceName })
  name: string;

  /** 明文前缀（`hbc_` 之后的前 8 位） */
  @Column({ type: 'varchar', length: LENGTH.keyPrefix })
  keyPrefix: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: LENGTH.keyHash })
  keyHash: string;

  /** 实例自报的平台信息（如 homebucket/1.2.0），仅用于诊断 */
  @Column({ type: 'varchar', length: LENGTH.platform, nullable: true })
  platform: string | null;

  /** 实例自报的版本号，同上 */
  @Column({ type: 'varchar', length: LENGTH.instanceVersion, nullable: true })
  version: string | null;

  /** 最近一次成功鉴权时间（ISO 字符串，理由见 CatalogItem） */
  @Column({ type: 'varchar', length: LENGTH.isoTime, nullable: true })
  lastSeenAt: string | null;

  /** 累计收到多少条上报（含后来被屏蔽的） */
  @Column({ type: 'int', default: 0 })
  contributionCount: number;

  /** 封禁：非空即拒绝上报（老数据保留，纠错台仍能看到它的历史） */
  @Column({ type: 'boolean', default: false })
  blocked: boolean;

  @Column({ type: 'varchar', length: LENGTH.blockReason, nullable: true })
  blockedReason: string | null;

  @Column({ type: 'varchar', length: LENGTH.isoTime, nullable: true })
  blockedAt: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
