import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 同 mysql/1792400000000-AddInstanceState.ts：新增 `InstanceState` 表
 * （实例级一次性状态：初始化引导是否已完成）。
 *
 * 建表语句是 `schema:log` 对实体生成的原样输出，**不要手改**。
 *
 * 回填同样重要：老部署升级上来时库里有用户，按"早就初始化过"处理，
 * 否则会突然被要求重新走一遍引导页。新库没有用户 → 不写入 → 正常进入引导。
 */
export class AddInstanceState1792400000000 implements MigrationInterface {
  name = 'AddInstanceState1792400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('InstanceState'))) {
      await queryRunner.query(
        `CREATE TABLE "InstanceState" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "setupCompletedAt" datetime(3))`,
      );
    }

    await queryRunner.query(
      `INSERT INTO "InstanceState" ("setupCompletedAt") SELECT datetime('now') WHERE EXISTS (SELECT 1 FROM "User")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('InstanceState'))) {
      return;
    }

    await queryRunner.query(`DROP TABLE "InstanceState"`);
  }
}
