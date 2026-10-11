import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 同 mysql/1791900000001-AddUserProfileFields.ts：给 `User` 加
 * `takenOutAlertDays`（取走过久提醒阈值，默认 7，`0` = 关闭提醒）与
 * `avatarId`（头像附件 id，可空，无外键 —— 理由见 `user.entity.ts` 里该列的注释）。
 *
 * 两列都是可空/带默认值的纯增量列，直接 ALTER TABLE 追加；与
 * 1791700000000-AddPackaging 同一写法，逐列 `hasColumn` 守卫，可重复执行。
 */
export class AddUserProfileFields1791900000001 implements MigrationInterface {
  name = 'AddUserProfileFields1791900000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('User', 'takenOutAlertDays'))) {
      await queryRunner.query(
        `ALTER TABLE "User" ADD COLUMN "takenOutAlertDays" integer NOT NULL DEFAULT (7)`,
      );
    }
    if (!(await queryRunner.hasColumn('User', 'avatarId'))) {
      await queryRunner.query(`ALTER TABLE "User" ADD COLUMN "avatarId" integer`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('User', 'avatarId')) {
      await queryRunner.query(`ALTER TABLE "User" DROP COLUMN "avatarId"`);
    }
    if (await queryRunner.hasColumn('User', 'takenOutAlertDays')) {
      await queryRunner.query(`ALTER TABLE "User" DROP COLUMN "takenOutAlertDays"`);
    }
  }
}
