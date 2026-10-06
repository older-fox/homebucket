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
import { Item } from './item.entity';
import { Tag } from './tag.entity';

const STRING_LENGTH = 191;
/** 与 Item.price 保持一致，见 item.entity.ts 的说明 */
const MONEY_PRECISION = 12;
const MONEY_SCALE = 2;

/**
 * 物品模板：常买常放的东西存一份预设，新建物品时一键套用。
 *
 * 模板可以绑定商品条码（barcode，家庭内唯一）—— 扫这个码就命中模板并预填表单。
 * 这是"模板 + 条码"闭环的关键字段，所以新建物品表单里条码字段排在最前面。
 */
@Entity('Template')
@Unique(['familyId', 'barcode'])
@Index(['familyId', 'name'])
export class Template {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  familyId: number;

  @Column({ type: 'varchar', length: STRING_LENGTH })
  name: string;

  @Column({ type: 'varchar', length: STRING_LENGTH, nullable: true })
  description: string | null;

  /** 绑定的商品条码；扫码命中即套用本模板 */
  @Column({ type: 'varchar', length: STRING_LENGTH, nullable: true })
  barcode: string | null;

  @Column({ type: 'int', nullable: true })
  imageId: number | null;

  @Column({ type: 'int', default: 1 })
  quantity: number;

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

  /** 套用模板时预选的存放位置 */
  @Column({ type: 'int', nullable: true })
  defaultLocationId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ---- 关系 ----

  @ManyToOne(() => Family, (family) => family.templates, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'familyId' })
  family: Family;

  @ManyToOne(() => Attachment, (attachment) => attachment.templates, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'imageId' })
  image: Attachment | null;

  @ManyToOne(() => Location, (location) => location.templates, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'defaultLocationId' })
  defaultLocation: Location | null;

  /** 由本模板创建出来的物品（模板删除时置空模板引用，物品保留） */
  @OneToMany(() => Item, (item) => item.template)
  items: Item[];

  /**
   * 标签（多对多 `_TemplateTags`）。
   * ⚠️ 旧库这个连接表 A 列指向 Tag、B 列指向 Template（与 `_ItemTags` 相反），
   * 所以拥有方的 joinColumn 是 B。
   */
  @ManyToMany(() => Tag, (tag) => tag.templates)
  @JoinTable({
    name: '_TemplateTags',
    joinColumn: { name: 'B', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'A', referencedColumnName: 'id' },
  })
  tags: Tag[];
}
