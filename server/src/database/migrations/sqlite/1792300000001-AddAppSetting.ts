import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 同 mysql/1792300000001-AddAppSetting.ts：新增 `AppSetting` 表（实例级配置）。
 *
 * 建表语句是 `schema:log` 对实体生成的原样输出（时间列默认为 `datetime('now')` 的括号写法，
 * 与 1791900000000-AddApiKey / 1792100000000-AddDataCollectionState 一致），**不要手改**。
 */
export class AddAppSetting1792300000001 implements MigrationInterface {
  name = 'AddAppSetting1792300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('AppSetting')) {
      return;
    }

    await queryRunner.query(
      `CREATE TABLE "AppSetting" ("envName" varchar(191) PRIMARY KEY NOT NULL, "value" text, "updatedBy" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('AppSetting'))) {
      return;
    }

    await queryRunner.query(`DROP TABLE "AppSetting"`);
  }
}
