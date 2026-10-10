import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Family } from './family.entity';
import { Item } from './item.entity';
import { Location } from './location.entity';
import { ForeignKeyIndex } from './foreign-key-index';

const STRING_LENGTH = 191;

/**
 * 物品的单件实体（序列号）。
 *
 * 需要按件追踪的物品可以登记多个 SN —— 关键点是**每个 SN 可以各自放在不同位置**：
 * 两台一样的落地扇，一台在储藏室、一台在卧室，各自一条 ItemUnit。
 * 因此位置详情页要按 locationId 聚合 SN，这才有了 (familyId, locationId) 索引。
 *
 * sn 在家庭内唯一（@@unique([familyId, sn])）：同一家庭不允许两条相同的 SN。
 */
@Entity('ItemUnit')
@Unique(['familyId', 'sn'])
@Index(['familyId', 'itemId'])
@Index(['familyId', 'locationId'])
export class ItemUnit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  familyId: number;

  @ForeignKeyIndex('IDX_ItemUnit_itemId')
  @Column({ type: 'int' })
  itemId: number;

  @Column({ type: 'varchar', length: STRING_LENGTH, nullable: true })
  sn: string | null;

  @ForeignKeyIndex('IDX_ItemUnit_locationId')
  @Column({ type: 'int', nullable: true })
  locationId: number | null;

  @Column({ type: 'varchar', length: STRING_LENGTH, nullable: true })
  note: string | null;

  /**
   * 取走时间：非空表示这一个 SN 当前被拿走使用了。
   *
   * 状态必须按件记，不能只记在物品上：同型号的三台风扇，
   * 可能只借出去一台，整件物品的 quantity 说明不了这件事。
   */
  @Column({ type: 'datetime', precision: 3, nullable: true })
  takenOutAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ---- 关系 ----

  @ManyToOne(() => Family, (family) => family.itemUnits, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'familyId' })
  family: Family;

  /** 物品删除时整批 SN 一起删 */
  @ManyToOne(() => Item, (item) => item.units, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'itemId' })
  item: Item;

  @ManyToOne(() => Location, (location) => location.itemUnits, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'locationId' })
  location: Location | null;
}
