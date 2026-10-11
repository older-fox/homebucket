import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { LENGTH } from './column-spec';

/**
 * 一次上报（append-only：除了"屏蔽"标记，内容永不修改）。
 *
 * ── 为什么原始 body 也要存 ──
 * 收集器的价值在于"多来源交叉验证"，而交叉验证的前提是能回看每个来源到底说了什么。
 * 合并后的 CatalogItem 只是当下最优解，不是事实全集。纠错台屏蔽一条错误上报后，
 * 物品资料是**从这张表重算**出来的（见 contributions.service.recomputeItem），
 * 所以这里必须留下足够重建的原始数据。
 *
 * `appliedFields` 记录这次上报实际改动了哪些字段：重复上报（内容一样）会是空数组，
 * 这比"看起来收到了很多数据"更能反映真实贡献。
 */
@Entity('Contribution')
@Index(['catalogItemId', 'observedAt'])
@Index(['instanceId'])
@Index(['contentHash'])
@Index(['blocked'])
@Index(['createdAt'])
export class Contribution {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  catalogItemId: number;

  /** 上报方（CollectorInstance.id）；人工纠错为 NULL */
  @Column({ type: 'int', nullable: true })
  instanceId: number | null;

  /** 上报涉及的条码（冗余一份，便于按条码审计，即使条目后来被合并） */
  @Column({ type: 'varchar', length: LENGTH.barcode, nullable: true })
  barcode: string | null;

  /** 归一化后的上报内容（JSON），重算的唯一输入 */
  @Column({ type: 'varchar', length: LENGTH.payloadJson })
  payload: string;

  /** 这次实际写入的字段名（JSON 数组）；空数组＝只留痕没改动 */
  @Column({ type: 'varchar', length: LENGTH.appliedFieldsJson, nullable: true })
  appliedFields: string | null;

  /**
   * 内容指纹（归一化字段的稳定序列化再 sha256）。
   * 用来识别"同一个实例重复上报同一条资料"，也方便排查某个来源是不是在刷量。
   */
  @Column({ type: 'varchar', length: LENGTH.keyHash })
  contentHash: string;

  /** 来源：api（实例上报）/ admin（人工纠错） */
  @Column({ type: 'varchar', length: LENGTH.source, default: 'api' })
  source: string;

  /** 数据本身的观测时间（上报方可指定，用于离线实例乱序补报）；ISO-8601 UTC 字符串 */
  @Column({ type: 'varchar', length: LENGTH.isoTime })
  observedAt: string;

  /**
   * 屏蔽标记：被屏蔽的上报不参与合并重算，也不出现在公开的物品资料里，
   * 但仍留在审计日志里（"这条被谁、因为什么屏蔽了"本身就是要留档的事实）。
   */
  @Column({ type: 'boolean', default: false })
  blocked: boolean;

  @Column({ type: 'varchar', length: LENGTH.blockReason, nullable: true })
  blockedReason: string | null;

  @Column({ type: 'varchar', length: LENGTH.isoTime, nullable: true })
  blockedAt: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
