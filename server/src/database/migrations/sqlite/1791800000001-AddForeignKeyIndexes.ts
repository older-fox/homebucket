import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 给 SQLite 的外键列补索引。
 *
 * 为什么需要：MySQL 的 InnoDB 会为每个外键自动建一个索引，SQLite 不会。
 * 于是同一套实体在 SQLite 上按这些列查询（以及 `ON DELETE CASCADE` 的级联删除）
 * 会退化成全表扫描。这里补上 13 个缺失的索引。
 *
 * 为什么实体上也要声明：TypeORM 同步 schema 时会把"元数据里没有的索引"当成野索引删掉
 * （RdbmsSchemaBuilder.shouldDropIndices 找不到同名元数据就 return true），所以实体上用
 * `@Index(name, { synchronize: false })` 声明同名索引：既不重复创建，也不会被删。
 * 详见 `server/src/entities/foreign-key-index.ts`。
 *
 * 为什么 MySQL 侧不受影响：MysqlQueryRunner 读取索引时故意排除了外键自带的索引
 * （只取 `rc.CONSTRAINT_NAME IS NULL` 的那些），InnoDB 隐式建的索引 TypeORM 根本看不见，
 * 所以这些 `synchronize: false` 的声明在 MySQL 上既不会建也不会删。
 *
 * 索引名必须与实体上的 @Index(...) 逐字一致。全新库由 Init 直接建好同样的索引，
 * 因此这里用 IF NOT EXISTS 保持幂等。
 */
export class AddForeignKeyIndexes1791800000001 implements MigrationInterface {
  name = 'AddForeignKeyIndexes1791800000001';

  /** 与 entities/foreign-key-index.ts 里的声明、以及 Init 里的 CREATE INDEX 保持逐字一致 */
  private static readonly FOREIGN_KEY_INDEXES: Array<{ name: string; table: string; column: string }> = [
    { name: 'IDX_Attachment_uploadedById', table: 'Attachment', column: 'uploadedById' },
    { name: 'IDX_Family_ownerId', table: 'Family', column: 'ownerId' },
    { name: 'IDX_FamilyInvite_createdById', table: 'FamilyInvite', column: 'createdById' },
    { name: 'IDX_Item_locationId', table: 'Item', column: 'locationId' },
    { name: 'IDX_Item_templateId', table: 'Item', column: 'templateId' },
    { name: 'IDX_Item_coverImageId', table: 'Item', column: 'coverImageId' },
    { name: 'IDX_ItemUnit_itemId', table: 'ItemUnit', column: 'itemId' },
    { name: 'IDX_ItemUnit_locationId', table: 'ItemUnit', column: 'locationId' },
    { name: 'IDX_Location_parentId', table: 'Location', column: 'parentId' },
    { name: 'IDX_Location_imageId', table: 'Location', column: 'imageId' },
    { name: 'IDX_Template_imageId', table: 'Template', column: 'imageId' },
    { name: 'IDX_Template_defaultLocationId', table: 'Template', column: 'defaultLocationId' },
    { name: 'IDX_User_defaultFamilyId', table: 'User', column: 'defaultFamilyId' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const index of AddForeignKeyIndexes1791800000001.FOREIGN_KEY_INDEXES) {
      // 表可能不存在（例如只跑过部分迁移的残缺库），跳过而不是让整条迁移失败
      if (!(await queryRunner.hasTable(index.table))) continue;
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "${index.name}" ON "${index.table}" ("${index.column}")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const index of AddForeignKeyIndexes1791800000001.FOREIGN_KEY_INDEXES) {
      // 全新库的索引是 Init 建的，回滚这一条迁移不应该把它删掉；这里仍按"回滚自己做过的事"
      // 处理即可：Init 的 down() 会连带删表，索引随表消失。
      await queryRunner.query(`DROP INDEX IF EXISTS "${index.name}"`);
    }
  }
}
