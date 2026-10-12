import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 证据行补上 `userAgent`：让「来源管理」页能回答"这个 `f:…` 到底是谁"。
 *
 * ── 为什么要存 UA 原文 ──
 * 来源键是 `sha256(ip + '\u0001' + userAgent)` 的截断，而 IP 与 UA 都不能从哈希反推。
 * 管理员看到一排 `f:9a1c…` 时，光靠权重和票数无法判断"这是几个浏览器在正常上报，
 * 还是一个脚本在灌数据"。UA 本身是客户端自报的软件标识、不指向个人，摆出来
 * 是这一页能给出结论的关键；IP 则相反，仍然只留哈希（`sourceIpHash`），
 * 只用于计数"同一个键后面出现过几个不同出口"。
 *
 * ── 为什么这次也要重建表 ──
 * SQLite 的 `ALTER TABLE ADD COLUMN` 加不了带默认值以外的花活，更关键的是
 * TypeORM 的 schema 比对只认自己那套"建临时表 → 搬数据 → 改名 → 重建索引"。
 * 手写 `ADD COLUMN` 能让运行时跑起来，但 `db:check-drift` 会比出漂移。
 * 下面的 SQL 是 `createSchemaBuilder().log()` 对着 EntitySchema 生成的原样输出，
 * 索引名是 TypeORM 按表名列名哈希出来的，**不要手改**。
 *
 * 旧行的 `userAgent` 为 null（历史数据无法追溯），界面上按"未记录"展示。
 */

const UP: string[] = [
  `DROP INDEX "IDX_5d74b52611f364cca1449ad848"`,
  `DROP INDEX "IDX_56051b63801a147035660a54f0"`,
  `DROP INDEX "IDX_d78f5b47e2b65696e0d64e4780"`,
  `DROP INDEX "IDX_ccfca828f1767ad990df967fdb"`,
  `DROP INDEX "IDX_df7d7fe721772be1124924b07a"`,
  `CREATE TABLE "temporary_ItemObservation" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "catalogItemId" integer NOT NULL, "instanceId" integer, "field" varchar(64) NOT NULL, "value" varchar(500) NOT NULL, "observationHash" varchar(64) NOT NULL, "observedAt" varchar(32) NOT NULL, "contributionId" integer, "weight" real NOT NULL DEFAULT (1), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "sourceKey" varchar(64), "sourceKind" varchar(16), "sourceLabel" varchar(80), "sourceIpHash" varchar(64), "userAgent" varchar(200))`,
  `INSERT INTO "temporary_ItemObservation"("id", "catalogItemId", "instanceId", "field", "value", "observationHash", "observedAt", "contributionId", "weight", "createdAt", "sourceKey", "sourceKind", "sourceLabel", "sourceIpHash") SELECT "id", "catalogItemId", "instanceId", "field", "value", "observationHash", "observedAt", "contributionId", "weight", "createdAt", "sourceKey", "sourceKind", "sourceLabel", "sourceIpHash" FROM "ItemObservation"`,
  `DROP TABLE "ItemObservation"`,
  `ALTER TABLE "temporary_ItemObservation" RENAME TO "ItemObservation"`,
  `CREATE INDEX "IDX_5d74b52611f364cca1449ad848" ON "ItemObservation" ("sourceKey") `,
  `CREATE UNIQUE INDEX "IDX_56051b63801a147035660a54f0" ON "ItemObservation" ("observationHash") `,
  `CREATE INDEX "IDX_d78f5b47e2b65696e0d64e4780" ON "ItemObservation" ("catalogItemId", "field") `,
  `CREATE INDEX "IDX_ccfca828f1767ad990df967fdb" ON "ItemObservation" ("instanceId") `,
  `CREATE INDEX "IDX_df7d7fe721772be1124924b07a" ON "ItemObservation" ("contributionId") `,
];

const DOWN: string[] = [
  `DROP INDEX "IDX_5d74b52611f364cca1449ad848"`,
  `DROP INDEX "IDX_56051b63801a147035660a54f0"`,
  `DROP INDEX "IDX_d78f5b47e2b65696e0d64e4780"`,
  `DROP INDEX "IDX_ccfca828f1767ad990df967fdb"`,
  `DROP INDEX "IDX_df7d7fe721772be1124924b07a"`,
  `CREATE TABLE "temporary_ItemObservation" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "catalogItemId" integer NOT NULL, "instanceId" integer, "field" varchar(64) NOT NULL, "value" varchar(500) NOT NULL, "observationHash" varchar(64) NOT NULL, "observedAt" varchar(32) NOT NULL, "contributionId" integer, "weight" real NOT NULL DEFAULT (1), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "sourceKey" varchar(64), "sourceKind" varchar(16), "sourceLabel" varchar(80), "sourceIpHash" varchar(64))`,
  `INSERT INTO "temporary_ItemObservation"("id", "catalogItemId", "instanceId", "field", "value", "observationHash", "observedAt", "contributionId", "weight", "createdAt", "sourceKey", "sourceKind", "sourceLabel", "sourceIpHash") SELECT "id", "catalogItemId", "instanceId", "field", "value", "observationHash", "observedAt", "contributionId", "weight", "createdAt", "sourceKey", "sourceKind", "sourceLabel", "sourceIpHash" FROM "ItemObservation"`,
  `DROP TABLE "ItemObservation"`,
  `ALTER TABLE "temporary_ItemObservation" RENAME TO "ItemObservation"`,
  `CREATE INDEX "IDX_5d74b52611f364cca1449ad848" ON "ItemObservation" ("sourceKey") `,
  `CREATE UNIQUE INDEX "IDX_56051b63801a147035660a54f0" ON "ItemObservation" ("observationHash") `,
  `CREATE INDEX "IDX_d78f5b47e2b65696e0d64e4780" ON "ItemObservation" ("catalogItemId", "field") `,
  `CREATE INDEX "IDX_ccfca828f1767ad990df967fdb" ON "ItemObservation" ("instanceId") `,
  `CREATE INDEX "IDX_df7d7fe721772be1124924b07a" ON "ItemObservation" ("contributionId") `,
];

export class ObservationUserAgent1792800000000 implements MigrationInterface {
  name = 'ObservationUserAgent1792800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const sql of UP) await queryRunner.query(sql);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const sql of DOWN) await queryRunner.query(sql);
  }
}
