import { Column, CreateDateColumn, Entity, JoinColumn, ManyToMany, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Family } from './family.entity';
import { Item } from './item.entity';
import { Template } from './template.entity';

const STRING_LENGTH = 191;

/**
 * 标签：跨位置的分类维度，前端展示成书签式的胶囊。
 *
 * name 在家庭内唯一（@@unique([familyId, name])），
 * color 是十六进制色值，默认用主题色。
 */
@Entity('Tag')
@Unique(['familyId', 'name'])
export class Tag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  familyId: number;

  @Column({ type: 'varchar', length: STRING_LENGTH })
  name: string;

  @Column({ type: 'varchar', length: STRING_LENGTH, default: '#14b8a6' })
  color: string;

  @CreateDateColumn()
  createdAt: Date;

  // ---- 关系 ----

  @ManyToOne(() => Family, (family) => family.tags, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'familyId' })
  family: Family;

  /** 反向侧：多对多的拥有方在 Item 上 */
  @ManyToMany(() => Item, (item) => item.tags)
  items: Item[];

  @ManyToMany(() => Template, (template) => template.tags)
  templates: Template[];
}
