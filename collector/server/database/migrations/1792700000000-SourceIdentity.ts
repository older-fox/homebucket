import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 投票身份从"实例 ID"改为"来源键"：`ItemObservation` / `ObservationFeedback` 加来源列，
 * `InstanceWeight` 换成 `SourceWeight`。
 *
 * ── 为什么必须改 ──
 * 收集器收到的上报**全是匿名的**（老契约 `POST /observations` 连身份字段都没有），
 * 落库时 `instanceId` 恒为 null。而投票/加权/封禁都要能回答"这两条上报是不是同一个来源"，
 * 于是身份改从请求本身推导：自报安装 ID（`r:<hash>`）→ IP+UA 指纹（`f:<hash>`），
 * 推导逻辑见 utils/source.ts。`instanceId` 列**保留但不删**：它仍然是
 * "这条证据恰好来自哪个已注册实例"的展示信息，删掉会丢掉历史。
 *
 * `InstanceWeight` 不是被改名，而是**换成另一张表**：语义真的变了（来源 vs 实例），
 * 且匿名来源压根没有 CollectorInstance 行可关联。老表里的权重按 `instanceId`
 * 已无意义（全部为空），所以直接 DROP、不迁移数据；权重是派生数据，
 * 迁移后跑一次 `POST /api/admin/weights/recompute` 即可从反馈重建。
 *
 * 下面的 SQL 是 `createSchemaBuilder().log()` 对着 EntitySchema 生成的原样输出
 * （SQLite 加列要重建表，故有 temporary_* 那套搬运动作）。
 * 索引名是 TypeORM 按表名列名哈希出来的，**不要手改**，否则 db:check-drift 立刻报漂移。
 */

const UP: string[] = [
  `DROP INDEX "IDX_12a11812f475f1b2781bb1d3eb"`,
  `CREATE TABLE "SourceWeight" ("sourceKey" varchar(64) PRIMARY KEY NOT NULL, "weight" real NOT NULL DEFAULT (1), "upvotes" integer NOT NULL DEFAULT (0), "downvotes" integer NOT NULL DEFAULT (0), "lastFeedbackAt" varchar(32), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
  `CREATE INDEX "IDX_2b7d2eccb429e71599fbd4b0f4" ON "SourceWeight" ("weight") `,
  `DROP INDEX "IDX_df7d7fe721772be1124924b07a"`,
  `DROP INDEX "IDX_ccfca828f1767ad990df967fdb"`,
  `DROP INDEX "IDX_d78f5b47e2b65696e0d64e4780"`,
  `DROP INDEX "IDX_56051b63801a147035660a54f0"`,
  `CREATE TABLE "temporary_ItemObservation" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "catalogItemId" integer NOT NULL, "instanceId" integer, "field" varchar(64) NOT NULL, "value" varchar(500) NOT NULL, "observationHash" varchar(64) NOT NULL, "observedAt" varchar(32) NOT NULL, "contributionId" integer, "weight" real NOT NULL DEFAULT (1), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "sourceKey" varchar(64), "sourceKind" varchar(16), "sourceLabel" varchar(80), "sourceIpHash" varchar(64))`,
  `INSERT INTO "temporary_ItemObservation"("id", "catalogItemId", "instanceId", "field", "value", "observationHash", "observedAt", "contributionId", "weight", "createdAt") SELECT "id", "catalogItemId", "instanceId", "field", "value", "observationHash", "observedAt", "contributionId", "weight", "createdAt" FROM "ItemObservation"`,
  `DROP TABLE "ItemObservation"`,
  `ALTER TABLE "temporary_ItemObservation" RENAME TO "ItemObservation"`,
  `CREATE INDEX "IDX_df7d7fe721772be1124924b07a" ON "ItemObservation" ("contributionId") `,
  `CREATE INDEX "IDX_ccfca828f1767ad990df967fdb" ON "ItemObservation" ("instanceId") `,
  `CREATE INDEX "IDX_d78f5b47e2b65696e0d64e4780" ON "ItemObservation" ("catalogItemId", "field") `,
  `CREATE UNIQUE INDEX "IDX_56051b63801a147035660a54f0" ON "ItemObservation" ("observationHash") `,
  `DROP INDEX "IDX_f1cdd60465717637f1a626aa73"`,
  `DROP INDEX "IDX_55d6865a87d4f6a651a99b98d5"`,
  `DROP INDEX "IDX_a598eb4b21a956f2142010c8a7"`,
  `CREATE TABLE "temporary_ObservationFeedback" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "catalogItemId" integer NOT NULL, "observationId" integer, "instanceId" integer, "field" varchar(64) NOT NULL, "value" varchar(500), "accurate" boolean NOT NULL, "reporterInstanceId" integer, "note" varchar(500), "reporterKey" varchar(64), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "sourceKey" varchar(64))`,
  `INSERT INTO "temporary_ObservationFeedback"("id", "catalogItemId", "observationId", "instanceId", "field", "value", "accurate", "reporterInstanceId", "note", "reporterKey", "createdAt") SELECT "id", "catalogItemId", "observationId", "instanceId", "field", "value", "accurate", "reporterInstanceId", "note", "reporterKey", "createdAt" FROM "ObservationFeedback"`,
  `DROP TABLE "ObservationFeedback"`,
  `ALTER TABLE "temporary_ObservationFeedback" RENAME TO "ObservationFeedback"`,
  `CREATE INDEX "IDX_f1cdd60465717637f1a626aa73" ON "ObservationFeedback" ("reporterKey") `,
  `CREATE INDEX "IDX_55d6865a87d4f6a651a99b98d5" ON "ObservationFeedback" ("instanceId") `,
  `CREATE INDEX "IDX_a598eb4b21a956f2142010c8a7" ON "ObservationFeedback" ("catalogItemId") `,
  `CREATE INDEX "IDX_5d74b52611f364cca1449ad848" ON "ItemObservation" ("sourceKey") `,
  `CREATE INDEX "IDX_3048e87049eb3df6800f3bf578" ON "ObservationFeedback" ("sourceKey") `,
  `CREATE INDEX "IDX_71ec2b1d5963c0a42a3607e201" ON "ObservationFeedback" ("sourceKey", "catalogItemId", "field") `,
];

const DOWN: string[] = [
  `CREATE INDEX "IDX_12a11812f475f1b2781bb1d3eb" ON "ObservationFeedback" ("instanceId", "catalogItemId", "field") `,
  `DROP TABLE "SourceWeight"`,
  `DROP INDEX "IDX_2b7d2eccb429e71599fbd4b0f4"`,
  `CREATE INDEX "IDX_df7d7fe721772be1124924b07a" ON "ItemObservation" ("contributionId") `,
  `CREATE INDEX "IDX_ccfca828f1767ad990df967fdb" ON "ItemObservation" ("instanceId") `,
  `CREATE INDEX "IDX_d78f5b47e2b65696e0d64e4780" ON "ItemObservation" ("catalogItemId", "field") `,
  `CREATE UNIQUE INDEX "IDX_56051b63801a147035660a54f0" ON "ItemObservation" ("observationHash") `,
  `DROP TABLE "temporary_ItemObservation"`,
  `INSERT INTO "ItemObservation"("id", "catalogItemId", "instanceId", "field", "value", "observationHash", "observedAt", "contributionId", "weight", "createdAt") SELECT "id", "catalogItemId", "instanceId", "field", "value", "observationHash", "observedAt", "contributionId", "weight", "createdAt" FROM "temporary_ItemObservation"`,
  `CREATE TABLE "ItemObservation" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "catalogItemId" integer NOT NULL, "instanceId" integer, "field" varchar(64) NOT NULL, "value" varchar(500) NOT NULL, "observationHash" varchar(64) NOT NULL, "observedAt" varchar(32) NOT NULL, "contributionId" integer, "weight" real NOT NULL DEFAULT (1), "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`,
  `ALTER TABLE "ItemObservation" RENAME TO "temporary_ItemObservation"`,
  `DROP INDEX "IDX_df7d7fe721772be1124924b07a"`,
  `DROP INDEX "IDX_ccfca828f1767ad990df967fdb"`,
  `DROP INDEX "IDX_d78f5b47e2b65696e0d64e4780"`,
  `DROP INDEX "IDX_56051b63801a147035660a54f0"`,
  `CREATE INDEX "IDX_f1cdd60465717637f1a626aa73" ON "ObservationFeedback" ("reporterKey") `,
  `CREATE INDEX "IDX_55d6865a87d4f6a651a99b98d5" ON "ObservationFeedback" ("instanceId") `,
  `CREATE INDEX "IDX_a598eb4b21a956f2142010c8a7" ON "ObservationFeedback" ("catalogItemId") `,
  `DROP TABLE "temporary_ObservationFeedback"`,
  `INSERT INTO "ObservationFeedback"("id", "catalogItemId", "observationId", "instanceId", "field", "value", "accurate", "reporterInstanceId", "note", "reporterKey", "createdAt") SELECT "id", "catalogItemId", "observationId", "instanceId", "field", "value", "accurate", "reporterInstanceId", "note", "reporterKey", "createdAt" FROM "temporary_ObservationFeedback"`,
  `CREATE TABLE "ObservationFeedback" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "catalogItemId" integer NOT NULL, "observationId" integer, "instanceId" integer, "field" varchar(64) NOT NULL, "value" varchar(500), "accurate" boolean NOT NULL, "reporterInstanceId" integer, "note" varchar(500), "reporterKey" varchar(64), "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`,
  `ALTER TABLE "ObservationFeedback" RENAME TO "temporary_ObservationFeedback"`,
  `DROP INDEX "IDX_f1cdd60465717637f1a626aa73"`,
  `DROP INDEX "IDX_55d6865a87d4f6a651a99b98d5"`,
  `DROP INDEX "IDX_a598eb4b21a956f2142010c8a7"`,
  `DROP INDEX "IDX_5d74b52611f364cca1449ad848"`,
  `DROP INDEX "IDX_3048e87049eb3df6800f3bf578"`,
  `DROP INDEX "IDX_71ec2b1d5963c0a42a3607e201"`,
];

export class SourceIdentity1792700000000 implements MigrationInterface {
  name = 'SourceIdentity1792700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const sql of UP) await queryRunner.query(sql);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const sql of DOWN) await queryRunner.query(sql);
  }
}
