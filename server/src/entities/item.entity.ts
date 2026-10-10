import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { decimalNumber } from './transformers';
import { Family } from './family.entity';
import { Attachment } from './attachment.entity';
import { Location } from './location.entity';
import { Template } from './template.entity';
import { ItemUnit } from './item-unit.entity';
import { Tag } from './tag.entity';

const STRING_LENGTH = 191;
/** DECIMAL(12,2) 上限 9,999,999,999.99，家庭记账足够，且比原先的 (65,30) 省一大截 */
const MONEY_PRECISION = 12;
const MONEY_SCALE = 2;

/**
 * 物品（台账主体）。
 *
 * 两个"码"要分清：
 *   · barcode   —— 厂家商品条码（EAN-13 / UPC 等），家庭内唯一，扫码解析优先级最高
 *   · traceCode —— 系统追溯码（HB-XXXX-XXXX），没有厂家码时由服务端生成，
 *                  家庭内唯一且创建后不可修改
 *   · qrToken   —— 物品二维码的 token（全局唯一，扫码直达物品）
 *
 * 唯一约束都带上 familyId：不同家庭可以各自拥有同一个商品条码，互不冲突。
 */
@Entity('Item')
@Unique(['familyId', 'barcode'])
@Unique(['familyId', 'traceCode'])
@Index(['familyId', 'createdAt'])
@Index(['familyId', 'locationId'])
@Index(['familyId', 'name'])
export class Item {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  familyId: number;

  @Column({ type: 'varchar', length: STRING_LENGTH })
  name: string;

  @Column({ type: 'varchar', length: STRING_LENGTH, nullable: true })
  description: string | null;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  /**
   * 单价（家庭主货币）。transformer 把 MySQL 的字符串 decimal 统一成 number，
   * 这样两个 provider 下调用方拿到的都是 number。
   */
  @Column({
    type: 'decimal',
    precision: MONEY_PRECISION,
    scale: MONEY_SCALE,
    default: 0,
    transformer: decimalNumber,
  })
  price: number;

  @Column({ type: 'varchar', length: STRING_LENGTH, nullable: true })
  model: string | null;

  @Column({ type: 'varchar', length: STRING_LENGTH, nullable: true })
  manufacturer: string | null;

  /** 厂家商品条码，家庭内唯一 */
  @Column({ type: 'varchar', length: STRING_LENGTH, nullable: true })
  barcode: string | null;

  /** 系统追溯码，家庭内唯一、创建后不可变更 */
  @Column({ type: 'varchar', length: STRING_LENGTH, nullable: true })
  traceCode: string | null;

  @Column({ type: 'int', nullable: true })
  locationId: number | null;

  @Column({ type: 'int', nullable: true })
  templateId: number | null;

  @Column({ type: 'int', nullable: true })
  coverImageId: number | null;

  @Column({ type: 'varchar', length: STRING_LENGTH, unique: true })
  qrToken: string;

  /**
   * 取走时间：非空表示这件物品当前处于「已拿走使用」状态。
   *
   * 用时间戳而不是布尔值：界面上「已取走」总要附带"多久之前"，
   * 只存 true/false 就还得再加一列时间，不如一步到位。
   * 按件追踪的物品（有 SN）状态记在 ItemUnit 上，这里管的是"整件物品"。
   */
  @Column({ type: 'datetime', precision: 3, nullable: true })
  takenOutAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ---- 关系 ----

  @ManyToOne(() => Family, (family) => family.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'familyId' })
  family: Family;

  /** 位置被删则置空（物品本身保留），避免误删位置连带丢台账 */
  @ManyToOne(() => Location, (location) => location.items, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'locationId' })
  location: Location | null;

  @ManyToOne(() => Template, (template) => template.items, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'templateId' })
  template: Template | null;

  @ManyToOne(() => Attachment, (attachment) => attachment.coverForItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'coverImageId' })
  coverImage: Attachment | null;

  /** 单个序列号实体；同一物品的多个 SN 可以各自放在不同位置 */
  @OneToMany(() => ItemUnit, (unit) => unit.item)
  units: ItemUnit[];

  /**
   * 图集（多对多 `_ItemImages`）。
   * ⚠️ 注意方向：旧库这个连接表的 A 列指向 Attachment、B 列指向 Item，
   * 与 `_ItemTags`（A=Item/B=Tag）正好相反，所以 joinColumn 必须是 B。
   */
  @ManyToMany(() => Attachment)
  @JoinTable({
    name: '_ItemImages',
    joinColumn: { name: 'B', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'A', referencedColumnName: 'id' },
  })
  images: Attachment[];

  /** 标签（多对多 `_ItemTags`，A=Item/B=Tag） */
  @ManyToMany(() => Tag, (tag) => tag.items)
  @JoinTable({
    name: '_ItemTags',
    joinColumn: { name: 'A', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'B', referencedColumnName: 'id' },
  })
  tags: Tag[];
}
