import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 新增 `AppSetting` 表：实例级配置（原 `.env` 里除数据库之外的那些项）。
 *
 * 键值表而不是"每项一列"：加配置只需在 `settings/settings.registry.ts` 里加一条，
 * 不用再为 MySQL 与 SQLite 各写一份迁移，也就不会把 `db:check-drift` 弄红。
 *
 * 主键列叫 `envName`（存 `SERVER_PORT` 这种环境变量名）而不是 `key`：
 * `key` 在 MySQL 里是保留字，靠反引号才能用，迟早会在某条手写 SQL 上绊一下。
 */
export class AddAppSetting1792300000001 implements MigrationInterface {
  name = 'AddAppSetting1792300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('AppSetting')) {
      return;
    }

    await queryRunner.query(
      `CREATE TABLE \`AppSetting\` (\`envName\` varchar(191) NOT NULL, \`value\` text NULL, \`updatedBy\` int NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`envName\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('AppSetting'))) {
      return;
    }

    await queryRunner.query(`DROP TABLE \`AppSetting\``);
  }
}
