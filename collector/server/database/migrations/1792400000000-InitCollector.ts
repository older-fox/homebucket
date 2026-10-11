import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 初始 schema（只支持 SQLite）。
 *
 * 为什么是手写 SQL 而不是 queryRunner.createTable()：
 * 实体用 EntitySchema 描述（Nitro 的 esbuild 打包不支持 emitDecoratorMetadata，装饰器实体会丢
 * design:type），而下面的语句是 `dataSource.driver.createSchemaBuilder().log()` 直接对着这些
 * EntitySchema 生成的，所以"迁移建出来的结构"与"实体期望的结构"逐字一致，
 * `npm run db:check-drift` 必然是零漂移。
 *
 * 索引名/唯一约束名是 TypeORM 按表名+列名哈希出来的（同一个表结构永远得到同一个名字），
 * 不要手改：改了名字 drift 检查就会认为缺少索引。
 */
const UP: string[] = [
  `CREATE TABLE "CatalogItem" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "identityKey" varchar(160) NOT NULL, "barcode" varchar(64), "name" varchar(200), "description" varchar(500), "model" varchar(120), "manufacturer" varchar(120), "category" varchar(80), "baseUnit" varchar(32), "imageUrls" text, "attributes" text, "fieldUpdatedAt" text, "lockedFields" text, "contributionCount" integer NOT NULL DEFAULT (0), "instanceCount" integer NOT NULL DEFAULT (0), "mergedIntoId" integer, "firstSeenAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_c15fff4babceb48d8e3bf969b84" UNIQUE ("identityKey"), CONSTRAINT "UQ_b2b9bdbd7838db854ed774263c3" UNIQUE ("barcode"))`,
  `CREATE INDEX "IDX_8bbc9f3809673761d019aad8e2" ON "CatalogItem" ("name") `,
  `CREATE INDEX "IDX_d1ee0535ae066eac6fa4125b9d" ON "CatalogItem" ("manufacturer") `,
  `CREATE INDEX "IDX_9822ce4c3d6303df1de5648835" ON "CatalogItem" ("mergedIntoId") `,
  `CREATE TABLE "Contribution" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "catalogItemId" integer NOT NULL, "instanceId" integer, "barcode" varchar(64), "payload" varchar(6000) NOT NULL, "appliedFields" varchar(500), "contentHash" varchar(64) NOT NULL, "source" varchar(32) NOT NULL DEFAULT ('api'), "observedAt" varchar(32) NOT NULL, "blocked" boolean NOT NULL DEFAULT (0), "blockedReason" varchar(200), "blockedAt" varchar(32), "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`,
  `CREATE INDEX "IDX_8d87e44ece00232fc8e3d36c12" ON "Contribution" ("catalogItemId", "observedAt") `,
  `CREATE INDEX "IDX_08904c0e090ec2e0c2edd8906d" ON "Contribution" ("instanceId") `,
  `CREATE INDEX "IDX_9dcc189ce0fbd8c2da09bf0ef3" ON "Contribution" ("contentHash") `,
  `CREATE INDEX "IDX_12559cacc42f0f2075f51b70b5" ON "Contribution" ("blocked") `,
  `CREATE INDEX "IDX_e852d04b4ec9afe333031d7846" ON "Contribution" ("createdAt") `,
  `CREATE TABLE "CollectorInstance" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(120) NOT NULL, "keyPrefix" varchar(24) NOT NULL, "keyHash" varchar(64) NOT NULL, "platform" varchar(80), "version" varchar(32), "lastSeenAt" varchar(32), "contributionCount" integer NOT NULL DEFAULT (0), "blocked" boolean NOT NULL DEFAULT (0), "blockedReason" varchar(200), "blockedAt" varchar(32), "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`,
  `CREATE INDEX "IDX_70b5f22de710eb4f2ec812150b" ON "CollectorInstance" ("blocked") `,
  `CREATE UNIQUE INDEX "IDX_6485271b4c5f8e70368aadc99d" ON "CollectorInstance" ("keyHash") `,
];

const DOWN: string[] = [
  `DROP TABLE "CatalogItem"`,
  `DROP INDEX "IDX_8bbc9f3809673761d019aad8e2"`,
  `DROP INDEX "IDX_d1ee0535ae066eac6fa4125b9d"`,
  `DROP INDEX "IDX_9822ce4c3d6303df1de5648835"`,
  `DROP TABLE "Contribution"`,
  `DROP INDEX "IDX_8d87e44ece00232fc8e3d36c12"`,
  `DROP INDEX "IDX_08904c0e090ec2e0c2edd8906d"`,
  `DROP INDEX "IDX_9dcc189ce0fbd8c2da09bf0ef3"`,
  `DROP INDEX "IDX_12559cacc42f0f2075f51b70b5"`,
  `DROP INDEX "IDX_e852d04b4ec9afe333031d7846"`,
  `DROP TABLE "CollectorInstance"`,
  `DROP INDEX "IDX_70b5f22de710eb4f2ec812150b"`,
  `DROP INDEX "IDX_6485271b4c5f8e70368aadc99d"`,
];

export class InitCollector1792400000000 implements MigrationInterface {
  name = 'InitCollector1792400000000';

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
