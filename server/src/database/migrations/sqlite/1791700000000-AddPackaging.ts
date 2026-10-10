import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 多级包装单位：Item 与 Template 各加 baseUnit / packLevels（与 mysql 侧同义）。
 * 与 mysql 侧的迁移同号；逐列 hasColumn 守卫，可重复执行。
 */
export class AddPackaging1791700000000 implements MigrationInterface {
  name = 'AddPackaging1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('Item', 'baseUnit'))) {
      await queryRunner.query(`ALTER TABLE "Item" ADD COLUMN "baseUnit" varchar(191)`);
    }
    if (!(await queryRunner.hasColumn('Item', 'packLevels'))) {
      await queryRunner.query(`ALTER TABLE "Item" ADD COLUMN "packLevels" text`);
    }
    if (!(await queryRunner.hasColumn('Template', 'baseUnit'))) {
      await queryRunner.query(`ALTER TABLE "Template" ADD COLUMN "baseUnit" varchar(191)`);
    }
    if (!(await queryRunner.hasColumn('Template', 'packLevels'))) {
      await queryRunner.query(`ALTER TABLE "Template" ADD COLUMN "packLevels" text`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('Item', 'packLevels')) {
      await queryRunner.query(`ALTER TABLE "Item" DROP COLUMN "packLevels"`);
    }
    if (await queryRunner.hasColumn('Item', 'baseUnit')) {
      await queryRunner.query(`ALTER TABLE "Item" DROP COLUMN "baseUnit"`);
    }
    if (await queryRunner.hasColumn('Template', 'packLevels')) {
      await queryRunner.query(`ALTER TABLE "Template" DROP COLUMN "packLevels"`);
    }
    if (await queryRunner.hasColumn('Template', 'baseUnit')) {
      await queryRunner.query(`ALTER TABLE "Template" DROP COLUMN "baseUnit"`);
    }
  }
}
