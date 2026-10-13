import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 同 mysql/1792300000000-AddInstanceAdmin.ts：给 `User` 加「实例管理员」标记，
 * 并把最早的那个用户回填成管理员（老库升级后不至于没人能进实例设置页）。
 *
 * 加列写法与 1791900000001-AddUserProfileFields 一致：带默认值的 NOT NULL 纯增量列
 * （SQLite 追加 NOT NULL 列必须给默认值，`DEFAULT (0)` 与既有迁移同风格）。
 */
export class AddInstanceAdmin1792300000000 implements MigrationInterface {
  name = 'AddInstanceAdmin1792300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('User', 'isInstanceAdmin'))) {
      await queryRunner.query(
        `ALTER TABLE "User" ADD COLUMN "isInstanceAdmin" boolean NOT NULL DEFAULT (0)`,
      );
    }

    // 只提一个：id 最小的那个。空表时更新 0 行，不会报错。
    await queryRunner.query(
      `UPDATE "User" SET "isInstanceAdmin" = 1 WHERE "id" = (SELECT MIN("id") FROM "User")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('User', 'isInstanceAdmin')) {
      await queryRunner.query(`ALTER TABLE "User" DROP COLUMN "isInstanceAdmin"`);
    }
  }
}
