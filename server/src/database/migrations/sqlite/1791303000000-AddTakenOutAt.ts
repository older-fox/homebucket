import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 同 mysql/1791303000000-AddTakenOutAt.ts：新增 `takenOutAt` 状态位。
 *
 * SQLite 的列类型只影响亲和性，`datetime(3)` 与 mysql 侧保持一致，
 * 这样两边实体映射出来的 schema 完全相同（`schema:log` 零漂移）。
 * DROP COLUMN 需要 SQLite ≥ 3.35，better-sqlite3 内置的版本远高于此。
 */
export class AddTakenOutAt1791303000000 implements MigrationInterface {
  name = 'AddTakenOutAt1791303000000';

  // 与 mysql 侧同理：逐列判断存在性，避免某一列已存在时 "duplicate column name"
  // 让整个迁移中断、缺失的列补不上。
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('Item', 'takenOutAt'))) {
      await queryRunner.query(`ALTER TABLE "Item" ADD COLUMN "takenOutAt" datetime(3)`);
    }
    if (!(await queryRunner.hasColumn('ItemUnit', 'takenOutAt'))) {
      await queryRunner.query(`ALTER TABLE "ItemUnit" ADD COLUMN "takenOutAt" datetime(3)`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('Item', 'takenOutAt')) {
      await queryRunner.query(`ALTER TABLE "Item" DROP COLUMN "takenOutAt"`);
    }
    if (await queryRunner.hasColumn('ItemUnit', 'takenOutAt')) {
      await queryRunner.query(`ALTER TABLE "ItemUnit" DROP COLUMN "takenOutAt"`);
    }
  }
}
