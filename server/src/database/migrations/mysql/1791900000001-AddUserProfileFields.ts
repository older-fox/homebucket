import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 账号资料字段：
 * - `takenOutAlertDays`：取走过久提醒阈值（天，默认 7，`0` = 关闭提醒，用户在前端设置）
 * - `avatarId`：头像附件 id（可空，无外键 —— 理由见 `user.entity.ts` 里该列的注释：
 *   SQLite 给已存在的表加外键必须整表重建，而 TypeORM 的 revert 路径在事务内关不掉外键，
 *   重建会失败/丢子表数据，所以两种方言都只存 id，完整性交给服务层）
 *
 * 两列都是纯增量，`takenOutAlertDays` 带默认值 7，老账号一升级就有合理默认。
 * 逐列 `hasColumn` 守卫，老库/半执行状态下重复执行也不会失败。
 */
export class AddUserProfileFields1791900000001 implements MigrationInterface {
  name = 'AddUserProfileFields1791900000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('User', 'takenOutAlertDays'))) {
      await queryRunner.query(
        `ALTER TABLE \`User\` ADD \`takenOutAlertDays\` int NOT NULL DEFAULT '7'`,
      );
    }
    if (!(await queryRunner.hasColumn('User', 'avatarId'))) {
      await queryRunner.query(`ALTER TABLE \`User\` ADD \`avatarId\` int NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('User', 'avatarId')) {
      await queryRunner.query(`ALTER TABLE \`User\` DROP COLUMN \`avatarId\``);
    }
    if (await queryRunner.hasColumn('User', 'takenOutAlertDays')) {
      await queryRunner.query(`ALTER TABLE \`User\` DROP COLUMN \`takenOutAlertDays\``);
    }
  }
}
