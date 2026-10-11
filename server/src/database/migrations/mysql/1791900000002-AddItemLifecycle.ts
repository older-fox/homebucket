import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 物品生命周期：`Item` 与 `ItemUnit` 各加两列。
 * - `lostAt`：非空表示「已遗失」（取走太久未归还时用户选择的处理方式）。不算删除，
 *   物品仍在库里、前端可见并带标记。
 * - `deletedAt`：非空表示软删除 —— **所有读接口都必须过滤掉（前端不可访问）**。
 *
 * 用软删除而不是硬删：操作历史靠 `ActivityLog` 的 actorName/itemName 快照保证可读，
 * 删除时间本身也是审计信息；硬删还会连带删掉 SN 与图片关联，误删无法挽回。
 *
 * 四列都是可空纯增量列，与 1791700000000-AddPackaging 一样逐列 `hasColumn` 守卫。
 */
export class AddItemLifecycle1791900000002 implements MigrationInterface {
  name = 'AddItemLifecycle1791900000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('Item', 'lostAt'))) {
      await queryRunner.query(`ALTER TABLE \`Item\` ADD \`lostAt\` datetime(3) NULL`);
    }
    if (!(await queryRunner.hasColumn('Item', 'deletedAt'))) {
      await queryRunner.query(`ALTER TABLE \`Item\` ADD \`deletedAt\` datetime(3) NULL`);
    }
    if (!(await queryRunner.hasColumn('ItemUnit', 'lostAt'))) {
      await queryRunner.query(`ALTER TABLE \`ItemUnit\` ADD \`lostAt\` datetime(3) NULL`);
    }
    if (!(await queryRunner.hasColumn('ItemUnit', 'deletedAt'))) {
      await queryRunner.query(`ALTER TABLE \`ItemUnit\` ADD \`deletedAt\` datetime(3) NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('ItemUnit', 'deletedAt')) {
      await queryRunner.query(`ALTER TABLE \`ItemUnit\` DROP COLUMN \`deletedAt\``);
    }
    if (await queryRunner.hasColumn('ItemUnit', 'lostAt')) {
      await queryRunner.query(`ALTER TABLE \`ItemUnit\` DROP COLUMN \`lostAt\``);
    }
    if (await queryRunner.hasColumn('Item', 'deletedAt')) {
      await queryRunner.query(`ALTER TABLE \`Item\` DROP COLUMN \`deletedAt\``);
    }
    if (await queryRunner.hasColumn('Item', 'lostAt')) {
      await queryRunner.query(`ALTER TABLE \`Item\` DROP COLUMN \`lostAt\``);
    }
  }
}
