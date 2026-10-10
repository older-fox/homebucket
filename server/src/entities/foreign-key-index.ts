import { Index } from 'typeorm';

/**
 * 给外键列补一个索引 —— 只有 SQLite 真正需要。
 *
 * 背景：MySQL 的 InnoDB 会为每个外键自动建一个索引（索引名与约束名同名），
 * SQLite 没有这个机制，外键列不显式建索引就是全表扫描 —— 级联删除尤其明显。
 * 实测：不加索引时 SQLite 侧的 Family.ownerId、Item.locationId 等 13 个外键列都没有索引。
 *
 * 为什么必须加 `synchronize: false`：
 *
 * 1. 这个索引由 **sqlite 迁移**（Init 与增量迁移）显式创建，不该由 schema 同步去建；
 * 2. MySQL 侧不需要它（InnoDB 已经有了），而 TypeORM 读取 MySQL 索引时会跳过
 *    「外键自带的」索引（见 MysqlQueryRunner 的 indicesSql：`rc.CONSTRAINT_NAME IS NULL`），
 *    所以 MySQL 既不会创建它、也不会因为库里没有它而报漂移；
 * 3. 最关键的是**不能被删掉**：RdbmsSchemaBuilder.dropOldIndices 会把「元数据里找不到
 *    同名索引」的库内索引当野索引清掉（实测手工加的索引会被 `DROP INDEX`），
 *    而 `synchronize: false` 的元数据项会让它直接返回 false，从而被保留。
 *
 * 因此这里的约定是：**索引名必须与 sqlite 迁移里 CREATE INDEX 的名字逐字一致**，
 * 否则同步会把它当野索引删掉。改名前先跑 `npm run db:show` 与 schema:log 确认零漂移。
 */
export const ForeignKeyIndex = (name: string) => Index(name, { synchronize: false });
