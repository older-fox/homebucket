import { MigrationInterface, QueryRunner } from "typeorm";

export class InitCollector1792400000000 implements MigrationInterface {
    name = 'InitCollector1792400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "CatalogItem" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "identityKey" varchar(160) NOT NULL, "barcode" varchar(64), "name" varchar(200), "description" varchar(500), "model" varchar(120), "manufacturer" varchar(120), "category" varchar(80), "baseUnit" varchar(32), "imageUrls" text, "attributes" text, "fieldUpdatedAt" text, "lockedFields" text, "contributionCount" integer NOT NULL DEFAULT (0), "instanceCount" integer NOT NULL DEFAULT (0), "mergedIntoId" integer, "firstSeenAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_c15fff4babceb48d8e3bf969b84" UNIQUE ("identityKey"), CONSTRAINT "UQ_b2b9bdbd7838db854ed774263c3" UNIQUE ("barcode"))`);
        await queryRunner.query(`CREATE INDEX "IDX_9822ce4c3d6303df1de5648835" ON "CatalogItem" ("mergedIntoId") `);
        await queryRunner.query(`CREATE INDEX "IDX_d1ee0535ae066eac6fa4125b9d" ON "CatalogItem" ("manufacturer") `);
        await queryRunner.query(`CREATE INDEX "IDX_8bbc9f3809673761d019aad8e2" ON "CatalogItem" ("name") `);
        await queryRunner.query(`CREATE TABLE "CollectorInstance" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(120) NOT NULL, "keyPrefix" varchar(24) NOT NULL, "keyHash" varchar(64) NOT NULL, "platform" varchar(80), "version" varchar(32), "lastSeenAt" varchar(32), "contributionCount" integer NOT NULL DEFAULT (0), "blocked" boolean NOT NULL DEFAULT (0), "blockedReason" varchar(200), "blockedAt" varchar(32), "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_6485271b4c5f8e70368aadc99d" ON "CollectorInstance" ("keyHash") `);
        await queryRunner.query(`CREATE INDEX "IDX_70b5f22de710eb4f2ec812150b" ON "CollectorInstance" ("blocked") `);
        await queryRunner.query(`CREATE TABLE "Contribution" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "catalogItemId" integer NOT NULL, "instanceId" integer, "barcode" varchar(64), "payload" varchar(6000) NOT NULL, "appliedFields" varchar(500), "contentHash" varchar(64) NOT NULL, "source" varchar(32) NOT NULL DEFAULT ('api'), "observedAt" varchar(32) NOT NULL, "blocked" boolean NOT NULL DEFAULT (0), "blockedReason" varchar(200), "blockedAt" varchar(32), "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_e852d04b4ec9afe333031d7846" ON "Contribution" ("createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_12559cacc42f0f2075f51b70b5" ON "Contribution" ("blocked") `);
        await queryRunner.query(`CREATE INDEX "IDX_9dcc189ce0fbd8c2da09bf0ef3" ON "Contribution" ("contentHash") `);
        await queryRunner.query(`CREATE INDEX "IDX_08904c0e090ec2e0c2edd8906d" ON "Contribution" ("instanceId") `);
        await queryRunner.query(`CREATE INDEX "IDX_8d87e44ece00232fc8e3d36c12" ON "Contribution" ("catalogItemId", "observedAt") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_8d87e44ece00232fc8e3d36c12"`);
        await queryRunner.query(`DROP INDEX "IDX_08904c0e090ec2e0c2edd8906d"`);
        await queryRunner.query(`DROP INDEX "IDX_9dcc189ce0fbd8c2da09bf0ef3"`);
        await queryRunner.query(`DROP INDEX "IDX_12559cacc42f0f2075f51b70b5"`);
        await queryRunner.query(`DROP INDEX "IDX_e852d04b4ec9afe333031d7846"`);
        await queryRunner.query(`DROP TABLE "Contribution"`);
        await queryRunner.query(`DROP INDEX "IDX_70b5f22de710eb4f2ec812150b"`);
        await queryRunner.query(`DROP INDEX "IDX_6485271b4c5f8e70368aadc99d"`);
        await queryRunner.query(`DROP TABLE "CollectorInstance"`);
        await queryRunner.query(`DROP INDEX "IDX_8bbc9f3809673761d019aad8e2"`);
        await queryRunner.query(`DROP INDEX "IDX_d1ee0535ae066eac6fa4125b9d"`);
        await queryRunner.query(`DROP INDEX "IDX_9822ce4c3d6303df1de5648835"`);
        await queryRunner.query(`DROP TABLE "CatalogItem"`);
    }

}
