import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 把 Prisma 时代留下的外键索引名改成 TypeORM 的命名。
 *
 * 为什么需要单独一步：
 *   MySQL 会为每个外键自动建一个支撑索引。Prisma 建表时这些索引叫 `<表>_<列>_fkey`
 *   （例如 Location_parentId_fkey）；TypeORM 建表时则让索引与**外键约束同名**
 *   （FK_<hash>）。规范化迁移把外键约束重命名成了 FK_<hash>，但没动这些老索引名，
 *   于是 `migration:generate` 会一直残留 13 条 "DROP INDEX ..._fkey" 的噪声 ——
 *   而且这些索引是外键必需的，MySQL 也不允许直接删掉。
 *
 * 所以这里用 RENAME INDEX 把它们对齐。RENAME 不影响数据、不影响外键，
 * 完成后库结构就与"全新安装"完全一致，后续 migration:generate 不会再产生噪声。
 *
 * 注：目标名 FK_<hash> 由 TypeORM 依据"表名+列名"计算，与全新安装时生成的完全一致
 * （已实测比对：迁移后的库与全新安装的库在同一个外键上得到相同的 FK_hash）。
 * 只有在这张表的外键本身发生变化时这个 hash 才会变，而那种情况本来就会有新的迁移来处理。
 */
export class RenamePrismaFkIndexes1791302900000 implements MigrationInterface {
  name = 'RenamePrismaFkIndexes1791302900000';

  private readonly renames: Array<[table: string, from: string, to: string]> = [
    ['Attachment', 'Attachment_uploadedById_fkey', 'FK_27a322b7a8c9dc19335ed2f18ce'],
    ['Family', 'Family_ownerId_fkey', 'FK_a2080d57eda956cac073803ac1f'],
    ['FamilyInvite', 'FamilyInvite_createdById_fkey', 'FK_aee74c7c75da1a8dd9ad750ef8e'],
    ['Item', 'Item_coverImageId_fkey', 'FK_294bd17c7561a6319da5b69a619'],
    ['Item', 'Item_locationId_fkey', 'FK_81bfd2a470f786abd1babac44cc'],
    ['Item', 'Item_templateId_fkey', 'FK_68d05b97558cbad80482e6444f6'],
    ['ItemUnit', 'ItemUnit_itemId_fkey', 'FK_b3f0a0ad87d66cae87be0598190'],
    ['ItemUnit', 'ItemUnit_locationId_fkey', 'FK_092ddadb955739d43e33f3150ea'],
    ['Location', 'Location_imageId_fkey', 'FK_05edf5d8bf6368727b022c3ef1e'],
    ['Location', 'Location_parentId_fkey', 'FK_65556fcd36c96e3f8385a7df6de'],
    ['Template', 'Template_defaultLocationId_fkey', 'FK_443fa753f7ca346084fc73df2a6'],
    ['Template', 'Template_imageId_fkey', 'FK_2ed84f7bdfd7ba3a8155f2ac603'],
    ['User', 'User_defaultFamilyId_fkey', 'FK_d9cacc0fba2ab08bfb9c9f53860'],
  ];

  /**
   * 老索引可能不存在（全新安装的库里本来就叫 FK_hash），所以先探测再改名，
   * 保证这个迁移在全新安装的库上也能安全跑过（此时它什么都不做）。
   */
  private async existingIndexes(queryRunner: QueryRunner, table: string): Promise<Set<string>> {
    const rows: Array<{ INDEX_NAME: string }> = await queryRunner.query(
      `SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
    );
    return new Set(rows.map((row) => row.INDEX_NAME));
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, from, to] of this.renames) {
      const existing = await this.existingIndexes(queryRunner, table);
      if (!existing.has(from)) continue;
      if (existing.has(to)) {
        // 目标名已存在（理论上不会发生），先删掉老索引避免重名
        await queryRunner.query(`ALTER TABLE \`${table}\` DROP INDEX \`${from}\``);
        continue;
      }
      await queryRunner.query(`ALTER TABLE \`${table}\` RENAME INDEX \`${from}\` TO \`${to}\``);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, from, to] of this.renames) {
      const existing = await this.existingIndexes(queryRunner, table);
      if (!existing.has(to)) continue;
      await queryRunner.query(`ALTER TABLE \`${table}\` RENAME INDEX \`${to}\` TO \`${from}\``);
    }
  }
}
