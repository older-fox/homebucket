import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Family } from './family.entity';
import { User } from './user.entity';
import { Item } from './item.entity';
import { Location } from './location.entity';
import { Template } from './template.entity';
import { ForeignKeyIndex } from './foreign-key-index';
import { STRING_LENGTH } from './column-spec';

/**
 * 上传的图片 / 文件。
 *
 * 两种存储模式共用这张表：
 *   · local —— url 为空，前端用 `/api/media/<key>` 取（由后端静态托管）
 *   · s3    —— url 存完整可访问地址
 */
@Entity('Attachment')
@Index(['familyId'])
export class Attachment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  familyId: number;

  /** 存储层的对象键（本地模式即上传目录下的相对路径） */
  @Column({ type: 'varchar', length: STRING_LENGTH })
  key: string;

  /** s3 模式下的完整地址；local 模式为 null */
  @Column({ type: 'varchar', length: STRING_LENGTH, nullable: true })
  url: string | null;

  @Column({ type: 'varchar', length: STRING_LENGTH })
  mime: string;

  /** 字节数 */
  @Column({ type: 'int' })
  size: number;

  @ForeignKeyIndex('IDX_Attachment_uploadedById')
  @Column({ type: 'int', nullable: true })
  uploadedById: number | null;

  @CreateDateColumn()
  createdAt: Date;

  // ---- 关系 ----

  @ManyToOne(() => Family, (family) => family.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'familyId' })
  family: Family;

  /** 上传者删除后置空，附件本身保留 */
  @ManyToOne(() => User, (user) => user.uploads, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploadedById' })
  uploadedBy: User | null;

  /** 作为物品封面的那些物品 */
  @OneToMany(() => Item, (item) => item.coverImage)
  coverForItem: Item[];

  /** 作为物品图集成员的那些物品（多对多 `_ItemImages`，反向侧） */
  @ManyToMany(() => Item, (item) => item.images)
  galleryItems: Item[];

  @OneToMany(() => Location, (location) => location.image)
  locations: Location[];

  @OneToMany(() => Template, (template) => template.image)
  templates: Template[];
}
