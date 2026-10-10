import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 操作历史表（ActivityLog）。
 *
 * 由 `migration:generate` 生成后按仓库迁移风格整理：类名去掉非法前缀、
 * 加 `hasTable` 守卫（幂等，避免老库/半执行状态下重复建表失败），
 * DDL（含索引名 IDX_*、外键名 FK_*）保持 TypeORM 生成的原样，保证 schema:log 零漂移。
 */
export class AddActivityLog1791650518610 implements MigrationInterface {
  name = 'AddActivityLog1791650518610';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('ActivityLog')) return;
    await queryRunner.query(
      `CREATE TABLE \`ActivityLog\` (\`id\` int NOT NULL AUTO_INCREMENT, \`familyId\` int NOT NULL, \`actorId\` int NULL, \`actorName\` varchar(191) NOT NULL DEFAULT '', \`targetType\` varchar(191) NOT NULL, \`targetId\` int NOT NULL, \`itemId\` int NULL, \`itemName\` varchar(191) NULL, \`action\` varchar(191) NOT NULL, \`changes\` text NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_dd5ee4c39c24360964f409c3a1\` (\`familyId\`, \`itemId\`), INDEX \`IDX_8a691bd5043087dc1e893fa93f\` (\`familyId\`, \`createdAt\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`ActivityLog\` ADD CONSTRAINT \`FK_caa4cdbdce900fd87141215b66c\` FOREIGN KEY (\`familyId\`) REFERENCES \`Family\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('ActivityLog'))) return;
    await queryRunner.query(`ALTER TABLE \`ActivityLog\` DROP FOREIGN KEY \`FK_caa4cdbdce900fd87141215b66c\``);
    await queryRunner.query(`DROP INDEX \`IDX_8a691bd5043087dc1e893fa93f\` ON \`ActivityLog\``);
    await queryRunner.query(`DROP INDEX \`IDX_dd5ee4c39c24360964f409c3a1\` ON \`ActivityLog\``);
    await queryRunner.query(`DROP TABLE \`ActivityLog\``);
  }
}
