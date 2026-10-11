import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 同 mysql/1791900000002-AddItemLifecycle.ts：`Item` 与 `ItemUnit` 各加
 * `lostAt`（已遗失软标记，前端可见）与 `deletedAt`（软删除，**读接口一律过滤**）。
 *
 * 两列都可空，直接 ALTER TABLE 追加即可（SQLite 从 3.35 起支持 ADD/DROP COLUMN，
 * better-sqlite3 内置版本远高于此），与 1791700000000-AddPackaging 同一写法。
 */
export class AddItemLifecycle1791900000002 implements MigrationInterface {
  name = 'AddItemLifecycle1791900000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('Item', 'lostAt'))) {
      await queryRunner.query(`ALTER TABLE "Item" ADD COLUMN "lostAt" datetime(3)`);
    }
    if (!(await queryRunner.hasColumn('Item', 'deletedAt'))) {
      await queryRunner.query(`ALTER TABLE "Item" ADD COLUMN "deletedAt" datetime(3)`);
    }
    if (!(await queryRunner.hasColumn('ItemUnit', 'lostAt'))) {
      await queryRunner.query(`ALTER TABLE "ItemUnit" ADD COLUMN "lostAt" datetime(3)`);
    }
    if (!(await queryRunner.hasColumn('ItemUnit', 'deletedAt'))) {
      await queryRunner.query(`ALTER TABLE "ItemUnit" ADD COLUMN "deletedAt" datetime(3)`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('ItemUnit', 'deletedAt')) {
      await queryRunner.query(`ALTER TABLE "ItemUnit" DROP COLUMN "deletedAt"`);
    }
    if (await queryRunner.hasColumn('ItemUnit', 'lostAt')) {
      await queryRunner.query(`ALTER TABLE "ItemUnit" DROP COLUMN "lostAt"`);
    }
    if (await queryRunner.hasColumn('Item', 'deletedAt')) {
      await queryRunner.query(`ALTER TABLE "Item" DROP COLUMN "deletedAt"`);
    }
    if (await queryRunner.hasColumn('Item', 'lostAt')) {
      await queryRunner.query(`ALTER TABLE "Item" DROP COLUMN "lostAt"`);
    }
  }
}
