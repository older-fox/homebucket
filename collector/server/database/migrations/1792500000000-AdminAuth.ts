import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 管理端鉴权：从"环境变量里的一枚令牌"改成"库里的账号 + 服务端会话"。
 *
 * 只加表，不动老表 —— 收集器的公共资料（CatalogItem/Contribution/CollectorInstance）
 * 与鉴权方式是两件独立的事，改鉴权不该碰任何业务数据。
 *
 * 与 InitCollector 一样，SQL 是 `dataSource.driver.createSchemaBuilder().log()`
 * 直接对着 EntitySchema 生成的（索引/约束名是 TypeORM 按表名列名哈希出来的），
 * 所以 `npm run db:check-drift` 必然零漂移；名字不要手改。
 */
const UP: string[] = [
  `CREATE TABLE "AdminUser" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "username" varchar(32) NOT NULL, "passwordHash" varchar(240) NOT NULL, "passwordChangedAt" varchar(32), "lastLoginAt" varchar(32), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_873ade051a3f96b16c6118c536d" UNIQUE ("username"))`,
  `CREATE TABLE "AdminSession" ("tokenHash" varchar(64) PRIMARY KEY NOT NULL, "adminUserId" integer NOT NULL, "expiresAt" varchar(32) NOT NULL, "lastUsedAt" varchar(32), "userAgent" varchar(200), "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`,
  `CREATE INDEX "IDX_dc80fa46991b5c4e3128a777b0" ON "AdminSession" ("adminUserId") `,
  `CREATE INDEX "IDX_ffade2a40690dfa34ff0af9b99" ON "AdminSession" ("expiresAt") `,
];

const DOWN: string[] = [
  `DROP TABLE "AdminUser"`,
  `DROP INDEX "IDX_ffade2a40690dfa34ff0af9b99"`,
  `DROP INDEX "IDX_dc80fa46991b5c4e3128a777b0"`,
  `DROP TABLE "AdminSession"`,
];

export class AdminAuth1792500000000 implements MigrationInterface {
  name = 'AdminAuth1792500000000';

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
