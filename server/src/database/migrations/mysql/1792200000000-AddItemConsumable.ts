import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 给 `Item` 加 `consumable`（是否消耗品），默认 0 = 非消耗品。
 *
 * 默认值让**全部历史物品保持原行为**（仍可取走），只有显式勾选的才是消耗品。
 *
 * MySQL 的 boolean 落成 `tinyint`（与 `Init.ts` 里的 `enabled`/`isPersonal` 一致），
 * `NOT NULL DEFAULT 0` 与实体的 `@Column({ type: 'boolean', default: false })` 对齐。
 */
export class AddItemConsumable1792200000000 implements MigrationInterface {
  name = 'AddItemConsumable1792200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('Item', 'consumable'))) {
      await queryRunner.query(
        `ALTER TABLE \`Item\` ADD COLUMN \`consumable\` tinyint NOT NULL DEFAULT 0`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('Item', 'consumable')) {
      await queryRunner.query(`ALTER TABLE \`Item\` DROP COLUMN \`consumable\``);
    }
  }
}
