import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LENGTH } from './column-spec';

/**
 * 目录里的一个「物品身份」—— 合并之后的当前最优资料。
 *
 * ── 为什么要有 identityKey，而不只用条码 ──
 * 上报里相当一部分物品没有厂家条码（自制件、散装、老物件、贴纸磨掉的）。如果只有
 * 条码能当身份，这些物品就只能各存各的、永远合不到一起。于是身份键分两种：
 *   · `barcode:<条码>`        —— 有条码时，条码就是最强信号
 *   · `fingerprint:<sha256>`  —— 没条码时，用「名称+型号+制造商」的指纹兜底
 * 两种写法进同一个唯一列，查询方只需要认 `identityKey` 一个概念。
 * 身份键**在首次建档时确定**，之后不再因为改名而改变（否则历史贡献会全部错位）。
 *
 * ── 为什么字段大多可空 ──
 * 资料是一条条报上来的，第一条往往只有名字。NULL 表示"还没人报过这个字段"，
 * 与空字符串（有人报了个空）不是一回事，所以统一用 NULL，写入前 trim + 丢空。
 * 合并规则见 common/identity.ts。
 *
 * ── 为什么用 ISO 字符串存时间，而不是 datetime 列 ──
 * 合并规则要比较"谁的观测更新"。ISO-8601 UTC 字符串的字典序就等于时间序，
 * 用 varchar 存完全绕开各驱动对 Date 的不同处理（时区、精度、返回类型），
 * 少一类跨库行为差异。`firstSeenAt`/`updatedAt` 只用于展示，才交给框架维护。
 */
@Entity('CatalogItem')
@Index(['name'])
@Index(['manufacturer'])
@Index(['mergedIntoId'])
export class CatalogItem {
  @PrimaryGeneratedColumn()
  id: number;

  /** 唯一身份键：`barcode:<条码>` 或 `fingerprint:<sha256>` */
  @Column({ type: 'varchar', length: LENGTH.identityKey, unique: true })
  identityKey: string;

  /** 厂家条码（EAN/UPC/Code128…）。无条码为 NULL —— SQLite/Postgres 唯一索引允许多个 NULL */
  @Column({ type: 'varchar', length: LENGTH.barcode, nullable: true, unique: true })
  barcode: string | null;

  @Column({ type: 'varchar', length: LENGTH.name, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: LENGTH.description, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: LENGTH.model, nullable: true })
  model: string | null;

  @Column({ type: 'varchar', length: LENGTH.manufacturer, nullable: true })
  manufacturer: string | null;

  @Column({ type: 'varchar', length: LENGTH.category, nullable: true })
  category: string | null;

  /** 最小计量单位（瓶/包/片…）。收集器只存名字，换算规则属于各实例自己的包装配置 */
  @Column({ type: 'varchar', length: LENGTH.baseUnit, nullable: true })
  baseUnit: string | null;

  /** JSON 数组：图片 URL 是**累加**的（任何实例拍的照片都值得留着） */
  @Column({ type: 'text', nullable: true })
  imageUrls: string | null;

  /** JSON 对象：{ 键: 值 }，给"任何属性"留的扩展位（容量、颜色、适配型号…） */
  @Column({ type: 'text', nullable: true })
  attributes: string | null;

  /** JSON 对象：{ 字段名: ISO 时间 }，字段级合并要用的"最后写入时间" */
  @Column({ type: 'text', nullable: true })
  fieldUpdatedAt: string | null;

  /**
   * JSON 数组：被人工锁定、拒绝自动改写的字段名。
   * 纠错台里改过的字段默认会进这里 —— 人工判断的优先级高于任何后续上报
   * （否则下一个实例上报就能把人工修正冲掉，纠错台就白做了）。
   */
  @Column({ type: 'text', nullable: true })
  lockedFields: string | null;

  /** 收到过多少条有效上报（不含被屏蔽的） */
  @Column({ type: 'int', default: 0 })
  contributionCount: number;

  /** 有多少个不同实例报过（按 instanceId 去重，人工修正不计） */
  @Column({ type: 'int', default: 0 })
  instanceCount: number;

  /**
   * 合并去向：人工/自动判定"这两条其实是一个东西"时，被并掉的那条指向保留的那条。
   * 保留整行而不是删除，是为了让历史贡献、外部链接、条码槽位都继续有效：
   * 按被并条码查询会 302 式的重定向到目标条目（见 items.service）。
   */
  @Column({ type: 'int', nullable: true })
  mergedIntoId: number | null;

  @CreateDateColumn()
  firstSeenAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
