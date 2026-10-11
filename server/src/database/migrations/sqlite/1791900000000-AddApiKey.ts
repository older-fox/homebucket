import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 同 mysql/1791900000000-AddApiKey.ts：新增 `ApiKey` 表。
 *
 * SQLite 侧就是把外键写成建表语句的一部分（生成器也是这么给的），索引单独 CREATE INDEX。
 */
export class AddApiKey1791900000000 implements MigrationInterface {
  name = 'AddApiKey1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('ApiKey')) {
      return;
    }

    await queryRunner.query(
      `CREATE TABLE "ApiKey" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "name" varchar(191) NOT NULL, "prefix" varchar(32) NOT NULL, "keyHash" varchar(191) NOT NULL, "lastUsedAt" datetime(3), "expiresAt" datetime(3), "revokedAt" datetime(3), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_150944bfb61672273d440e2d24f" UNIQUE ("keyHash"), CONSTRAINT "FK_7bc072c14b0d0362238790af8f4" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7bc072c14b0d0362238790af8f" ON "ApiKey" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('ApiKey'))) {
      return;
    }

    // 索引随表一起消失
    await queryRunner.query(`DROP TABLE "ApiKey"`);
  }
}
