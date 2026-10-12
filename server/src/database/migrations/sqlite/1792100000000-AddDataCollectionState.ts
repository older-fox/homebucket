import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 同 mysql/1792100000000-AddDataCollectionState.ts：新增 `DataCollectionState` 表。
 *
 * 建表语句是 `schema:log` 对实体生成的原样输出（默认值用 `datetime('now')` 的括号写法，
 * 与 1791900000000-AddApiKey 一致），**不要手改**。
 */
export class AddDataCollectionState1792100000000 implements MigrationInterface {
  name = 'AddDataCollectionState1792100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('DataCollectionState')) {
      return;
    }

    await queryRunner.query(
      `CREATE TABLE "DataCollectionState" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "instanceKey" varchar(64), "instanceKeyPrefix" varchar(16), "instanceId" integer, "instanceName" varchar(191), "registeredAt" datetime(3), "lastSyncAt" datetime(3), "lastErrorCode" varchar(64), "lastErrorAt" datetime(3), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('DataCollectionState'))) {
      return;
    }

    await queryRunner.query(`DROP TABLE "DataCollectionState"`);
  }
}
