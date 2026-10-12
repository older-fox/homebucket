import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 同 mysql/1792200000000-AddItemConsumable.ts：给 `Item` 加 `consumable`。
 *
 * SQLite 的 boolean 落成 `boolean`，默认值的括号写法与 1791302382566-Init.ts 里
 * `isPersonal` 那一列一致（`DEFAULT (0)`），这样 `db:check-drift` 才认。
 */
export class AddItemConsumable1792200000000 implements MigrationInterface {
  name = 'AddItemConsumable1792200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('Item', 'consumable'))) {
      await queryRunner.query(
        `ALTER TABLE "Item" ADD COLUMN "consumable" boolean NOT NULL DEFAULT (0)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('Item', 'consumable')) {
      await queryRunner.query(`ALTER TABLE "Item" DROP COLUMN "consumable"`);
    }
  }
}
