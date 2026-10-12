import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 三类新能力的表结构：逐字段观测证据与反馈权重、照片资产、出站同步状态。
 *
 * 为什么三件事放同一条迁移而不是拆三条：它们同时落地、也只会同时回滚
 * （页面、接口、权重计算互相依赖），拆开只会多两次"半套结构"的中间状态。
 * 老表一律不动 —— 已收录的资料与实例不受影响。
 *
 * 与 InitCollector / AdminAuth 一样，下面的 SQL 是
 * `dataSource.driver.createSchemaBuilder().log()` 直接对着 EntitySchema 生成的原样输出，
 * 索引名是 TypeORM 按表名列名哈希出来的，**不要手改**，否则 db:check-drift 立刻报漂移。
 */
const UP: string[] = [
  `CREATE TABLE "ItemObservation" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "catalogItemId" integer NOT NULL, "instanceId" integer, "field" varchar(64) NOT NULL, "value" varchar(500) NOT NULL, "observationHash" varchar(64) NOT NULL, "observedAt" varchar(32) NOT NULL, "contributionId" integer, "weight" real NOT NULL DEFAULT (1), "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`,
  `CREATE UNIQUE INDEX "IDX_56051b63801a147035660a54f0" ON "ItemObservation" ("observationHash") `,
  `CREATE INDEX "IDX_d78f5b47e2b65696e0d64e4780" ON "ItemObservation" ("catalogItemId", "field") `,
  `CREATE INDEX "IDX_ccfca828f1767ad990df967fdb" ON "ItemObservation" ("instanceId") `,
  `CREATE INDEX "IDX_df7d7fe721772be1124924b07a" ON "ItemObservation" ("contributionId") `,
  `CREATE TABLE "ObservationFeedback" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "catalogItemId" integer NOT NULL, "observationId" integer, "instanceId" integer, "field" varchar(64) NOT NULL, "value" varchar(500), "accurate" boolean NOT NULL, "reporterInstanceId" integer, "note" varchar(500), "reporterKey" varchar(64), "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`,
  `CREATE INDEX "IDX_a598eb4b21a956f2142010c8a7" ON "ObservationFeedback" ("catalogItemId") `,
  `CREATE INDEX "IDX_55d6865a87d4f6a651a99b98d5" ON "ObservationFeedback" ("instanceId") `,
  `CREATE INDEX "IDX_12a11812f475f1b2781bb1d3eb" ON "ObservationFeedback" ("instanceId", "catalogItemId", "field") `,
  `CREATE INDEX "IDX_f1cdd60465717637f1a626aa73" ON "ObservationFeedback" ("reporterKey") `,
  `CREATE TABLE "InstanceWeight" ("instanceId" integer PRIMARY KEY NOT NULL, "weight" real NOT NULL DEFAULT (1), "upvotes" integer NOT NULL DEFAULT (0), "downvotes" integer NOT NULL DEFAULT (0), "lastFeedbackAt" varchar(32), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
  `CREATE INDEX "IDX_d9f19d1c6e20312c093d9eefc1" ON "InstanceWeight" ("weight") `,
  `CREATE TABLE "PhotoAsset" ("hash" varchar(64) PRIMARY KEY NOT NULL, "driver" varchar(32) NOT NULL, "storageKey" varchar(600) NOT NULL, "mime" varchar(64) NOT NULL, "ext" varchar(8) NOT NULL, "bytes" integer NOT NULL, "width" integer, "height" integer, "instanceId" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`,
  `CREATE INDEX "IDX_12e74b05300e7cfd4e03231653" ON "PhotoAsset" ("instanceId") `,
  `CREATE INDEX "IDX_d840ac2b4330eded3eb6417dde" ON "PhotoAsset" ("createdAt") `,
  `CREATE TABLE "OutboundSync" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "catalogItemId" integer NOT NULL, "barcode" varchar(64), "transport" varchar(32) NOT NULL, "status" varchar(32) NOT NULL DEFAULT ('pending'), "attempts" integer NOT NULL DEFAULT (0), "lastAttemptAt" varchar(32), "syncedAt" varchar(32), "lastError" varchar(500), "remoteRef" varchar(200), "payloadHash" varchar(64), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
  `CREATE UNIQUE INDEX "IDX_de58baac1341fddfd2a10d6eb9" ON "OutboundSync" ("catalogItemId") `,
  `CREATE INDEX "IDX_ecfa0fe3da2a4f863e129197a6" ON "OutboundSync" ("status") `,
  `CREATE INDEX "IDX_1319fe5e4d88c23ada4da14357" ON "OutboundSync" ("syncedAt") `,
];

const DOWN: string[] = [
  `DROP TABLE "ItemObservation"`,
  `DROP INDEX "IDX_56051b63801a147035660a54f0"`,
  `DROP INDEX "IDX_d78f5b47e2b65696e0d64e4780"`,
  `DROP INDEX "IDX_ccfca828f1767ad990df967fdb"`,
  `DROP INDEX "IDX_df7d7fe721772be1124924b07a"`,
  `DROP TABLE "ObservationFeedback"`,
  `DROP INDEX "IDX_a598eb4b21a956f2142010c8a7"`,
  `DROP INDEX "IDX_55d6865a87d4f6a651a99b98d5"`,
  `DROP INDEX "IDX_12a11812f475f1b2781bb1d3eb"`,
  `DROP INDEX "IDX_f1cdd60465717637f1a626aa73"`,
  `DROP TABLE "InstanceWeight"`,
  `DROP INDEX "IDX_d9f19d1c6e20312c093d9eefc1"`,
  `DROP TABLE "PhotoAsset"`,
  `DROP INDEX "IDX_12e74b05300e7cfd4e03231653"`,
  `DROP INDEX "IDX_d840ac2b4330eded3eb6417dde"`,
  `DROP TABLE "OutboundSync"`,
  `DROP INDEX "IDX_de58baac1341fddfd2a10d6eb9"`,
  `DROP INDEX "IDX_ecfa0fe3da2a4f863e129197a6"`,
  `DROP INDEX "IDX_1319fe5e4d88c23ada4da14357"`,
];

export class ObservationsPhotosSync1792600000000 implements MigrationInterface {
  name = 'ObservationsPhotosSync1792600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const sql of UP) {
      await queryRunner.query(sql);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const sql of DOWN) {
      await queryRunner.query(sql);
    }
  }
}
