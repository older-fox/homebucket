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

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "Item" ADD COLUMN "takenOutAt" datetime(3)`);
    await queryRunner.query(`ALTER TABLE "ItemUnit" ADD COLUMN "takenOutAt" datetime(3)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "Item" DROP COLUMN "takenOutAt"`);
    await queryRunner.query(`ALTER TABLE "ItemUnit" DROP COLUMN "takenOutAt"`);
  }
}
