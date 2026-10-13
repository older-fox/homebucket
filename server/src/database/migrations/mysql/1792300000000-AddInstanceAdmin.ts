import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 给 `User` 加「实例管理员」标记，并把**最早的那个用户**回填成管理员。
 *
 * ── 为什么要回填 ──
 * 新库无所谓（`bootstrap-admin.ts` 建号时直接带上 true）；但**已有部署**升级上来时，
 * 如果只加一个默认 0 的列，就没有任何人能进「设置 → 实例设置」——
 * 等于这个功能上线即锁死。回填最早的用户（老库里就是引导创建的那个管理员，通常 id=1）
 * 是最贴近原意的启发式：安装时第一个建号的人，本来就是这份安装的负责人。
 * 若某套部署的 id=1 恰好不是管理员，可以由它自己再把位子交给别人（v1 没有让位入口，
 * 需要时直接改库 `UPDATE "User" SET isInstanceAdmin = 1 WHERE id = ?`）。
 *
 * 两列都是纯增量；`hasColumn` 守卫让重复执行（半执行状态重试）也安全。
 */
export class AddInstanceAdmin1792300000000 implements MigrationInterface {
  name = 'AddInstanceAdmin1792300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('User', 'isInstanceAdmin'))) {
      await queryRunner.query(
        `ALTER TABLE \`User\` ADD \`isInstanceAdmin\` tinyint NOT NULL DEFAULT '0'`,
      );
    }

    // 只提一个：id 最小的那个。空表时更新 0 行，不会报错。
    await queryRunner.query(
      `UPDATE \`User\` SET \`isInstanceAdmin\` = 1 WHERE \`id\` = (SELECT MIN(\`id\`) FROM (SELECT \`id\` FROM \`User\`) AS \`u\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('User', 'isInstanceAdmin')) {
      await queryRunner.query(`ALTER TABLE \`User\` DROP COLUMN \`isInstanceAdmin\``);
    }
  }
}
