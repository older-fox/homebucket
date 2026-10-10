import { Attachment } from './attachment.entity';
import { ActivityLog } from './activity-log.entity';
import { Family } from './family.entity';
import { FamilyInvite } from './family-invite.entity';
import { FamilyMember } from './family-member.entity';
import { Item } from './item.entity';
import { ItemUnit } from './item-unit.entity';
import { Location } from './location.entity';
import { NotificationChannel } from './notification-channel.entity';
import { Tag } from './tag.entity';
import { Template } from './template.entity';
import { User } from './user.entity';

/**
 * 全部实体清单（唯一来源）。
 *
 * 集中放在一个数组里，而不是靠 `autoLoadEntities` 或目录 glob：
 *   · 实体之间互相引用很密（Item ↔ Location ↔ Template ↔ Tag ↔ Attachment），集中定义避免循环 import 踩坑
 *   · migrations / CLI / seed 脚本都要同一份清单，显式导出最省事也不会漏
 *
 * ── 跨 provider 的三条约定（改实体时务必遵守，否则 MySQL 或 SQLite 会有一边跑不起来）──
 *
 * 1. **表名必须显式写**：`@Entity('Item')`。
 *    TypeORM 默认命名策略是 `snakeCase(类名)`（ItemUnit → item_unit），
 *    而现有库是 Prisma 建的表，名字就是驼峰。不显式指定会直接读不到表。
 *
 * 2. **时间列不传 precision 选项**，用裸的 `@CreateDateColumn()` / `@UpdateDateColumn()`。
 *    实测教训：`{ precision: 3 }` 会让 TypeORM 生成 `datetime(3) ... DEFAULT CURRENT_TIMESTAMP(6)`，
 *    MySQL 直接报 "Invalid default value"；而 `@UpdateDateColumn` 会自己加
 *    `ON UPDATE CURRENT_TIMESTAMP`（不带精度），同样报 "Invalid ON UPDATE clause"。
 *    裸写法由 TypeORM 自己按 provider 生成合法 DDL，并且**在 JS 侧insert/update 时都会赋值**，
 *    两个 provider 行为一致。代价是 MySQL 上是 datetime(6)（原库是 datetime(3)，加精度无损）。
 *
 * 3. **金额列要挂 `decimalNumber` transformer**：MySQL 驱动把 DECIMAL 读成字符串，
 *    SQLite 读成 number，不抹平的话每个调用方都得自己 `Number(...)`。
 *
 * 另外：不用 enum / Json / BigInt —— SQLite 不支持，要保持双 provider 兼容就统一用
 * String + 注释说明取值、字符串存 JSON。
 */
export const entities = [
  User,
  Family,
  FamilyMember,
  FamilyInvite,
  Attachment,
  Location,
  Item,
  ItemUnit,
  Tag,
  Template,
  NotificationChannel,
  ActivityLog,
];

export {
  Attachment,
  ActivityLog,
  Family,
  FamilyInvite,
  FamilyMember,
  Item,
  ItemUnit,
  Location,
  NotificationChannel,
  Tag,
  Template,
  User,
};
