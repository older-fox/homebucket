import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 操作历史表（ActivityLog）。与 mysql 侧同一个迁移时间戳。
 *
 * 由 `migration:generate` 生成后整理：外键约束改为在建表时内联声明
 * （SQLite 添加外键需要整表重建，生成器为此生成了 create→drop→recreate 的往返；
 * 内联写法得到完全相同的最终 schema，更简洁且无漂移）。索引名/FK 名保持生成器原样。
 */
export class AddActivityLog1791650518610 implements MigrationInterface {
  name = 'AddActivityLog1791650518610';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('ActivityLog')) return;
    await queryRunner.query(
      `CREATE TABLE "ActivityLog" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "familyId" integer NOT NULL, "actorId" integer, "actorName" varchar(191) NOT NULL DEFAULT (''), "targetType" varchar(191) NOT NULL, "targetId" integer NOT NULL, "itemId" integer, "itemName" varchar(191), "action" varchar(191) NOT NULL, "changes" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_caa4cdbdce900fd87141215b66c" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dd5ee4c39c24360964f409c3a1" ON "ActivityLog" ("familyId", "itemId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8a691bd5043087dc1e893fa93f" ON "ActivityLog" ("familyId", "createdAt") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('ActivityLog'))) return;
    await queryRunner.query(`DROP INDEX "IDX_8a691bd5043087dc1e893fa93f"`);
    await queryRunner.query(`DROP INDEX "IDX_dd5ee4c39c24360964f409c3a1"`);
    await queryRunner.query(`DROP TABLE "ActivityLog"`);
  }
}
