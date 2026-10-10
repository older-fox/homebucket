import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 多级包装单位：Item 与 Template 各加 baseUnit / packLevels。
 *
 * 两列都可空且为纯增量列：`baseUnit` 为空表示未启用包装，行为与改造前完全一致。
 * 逐列 `hasColumn` 守卫，老库/半执行状态下重复执行也不会失败。
 */
export class AddPackaging1791700000000 implements MigrationInterface {
  name = 'AddPackaging1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('Item', 'baseUnit'))) {
      await queryRunner.query(`ALTER TABLE \`Item\` ADD \`baseUnit\` varchar(191) NULL`);
    }
    if (!(await queryRunner.hasColumn('Item', 'packLevels'))) {
      await queryRunner.query(`ALTER TABLE \`Item\` ADD \`packLevels\` text NULL`);
    }
    if (!(await queryRunner.hasColumn('Template', 'baseUnit'))) {
      await queryRunner.query(`ALTER TABLE \`Template\` ADD \`baseUnit\` varchar(191) NULL`);
    }
    if (!(await queryRunner.hasColumn('Template', 'packLevels'))) {
      await queryRunner.query(`ALTER TABLE \`Template\` ADD \`packLevels\` text NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('Item', 'packLevels')) {
      await queryRunner.query(`ALTER TABLE \`Item\` DROP COLUMN \`packLevels\``);
    }
    if (await queryRunner.hasColumn('Item', 'baseUnit')) {
      await queryRunner.query(`ALTER TABLE \`Item\` DROP COLUMN \`baseUnit\``);
    }
    if (await queryRunner.hasColumn('Template', 'packLevels')) {
      await queryRunner.query(`ALTER TABLE \`Template\` DROP COLUMN \`packLevels\``);
    }
    if (await queryRunner.hasColumn('Template', 'baseUnit')) {
      await queryRunner.query(`ALTER TABLE \`Template\` DROP COLUMN \`baseUnit\``);
    }
  }
}
