import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Family } from './family.entity';
import { Attachment } from './attachment.entity';
import { Item } from './item.entity';
import { ItemUnit } from './item-unit.entity';
import { Template } from './template.entity';
import { ForeignKeyIndex } from './foreign-key-index';
import { STRING_LENGTH } from './column-spec';

/**
 * 位置（自引用树）。
 *
 * 深度不限（门口/客厅/卧室/储藏室/车库…）。parentId 为空即顶层。
 * 删除父节点会级联删除整棵子树（ON DELETE CASCADE），这一点在业务层要提示用户。
 *
 * 复合索引 (familyId, parentId, sortIndex) 同时服务三件事：
 * 按家庭过滤、按父节点取直接下级、以及同级按 sortIndex 排序。
 */
@Entity('Location')
@Index(['familyId', 'parentId', 'sortIndex'])
export class Location {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  familyId: number;

  @ForeignKeyIndex('IDX_Location_parentId')
  @Column({ type: 'int', nullable: true })
  parentId: number | null;

  @Column({ type: 'varchar', length: STRING_LENGTH })
  name: string;

  @Column({ type: 'varchar', length: STRING_LENGTH, nullable: true })
  description: string | null;

  @ForeignKeyIndex('IDX_Location_imageId')
  @Column({ type: 'int', nullable: true })
  imageId: number | null;

  /**
   * 同级排序位。用 float 而不是 int，是为了拖拽插入到两项之间时
   * 可以取中间值，不必重排整个同级列表。
   */
  @Column({ type: 'double', default: 0 })
  sortIndex: number;

  /** 位置二维码里编码的 token（全局唯一，扫码直达该位置） */
  @Column({ type: 'varchar', length: STRING_LENGTH, unique: true })
  qrToken: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ---- 关系 ----

  @ManyToOne(() => Family, (family) => family.locations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'familyId' })
  family: Family;

  @ManyToOne(() => Location, (location) => location.children, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parentId' })
  parent: Location | null;

  @OneToMany(() => Location, (location) => location.parent)
  children: Location[];

  /** 位置照片；图片被删则置空，不连带删位置 */
  @ManyToOne(() => Attachment, (attachment) => attachment.locations, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'imageId' })
  image: Attachment | null;

  @OneToMany(() => Item, (item) => item.location)
  items: Item[];

  @OneToMany(() => ItemUnit, (unit) => unit.location)
  itemUnits: ItemUnit[];

  @OneToMany(() => Template, (template) => template.defaultLocation)
  templates: Template[];
}
