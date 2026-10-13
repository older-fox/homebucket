import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 新增 `InstanceState` 表：实例级一次性状态（单例行），目前只放"初始化引导是否已完成"。
 *
 * 为什么需要它：新版把"第一个管理员"从 .env 的 DEFAULT_ADMIN_* 挪到了引导页，
 * 因此需要一个**持久标记**来回答"这个实例到底初始化过没有"。
 * 不用"用户表是否为空"判断：删光用户或只恢复部分数据会让已用起来的实例又跳回引导页。
 *
 * ── ⚠️ 必须回填，否则老部署升级后会被拉进引导页 ──
 * 标记默认是"没完成"，所以升级上来的现有部署（库里有用户）会突然被要求重新初始化。
 * 这里按"库里已经有用户"判定它早就初始化过了，直接写入完成时间。
 * 新库没有用户 → 不写入 → 正常进入引导页。
 * 迁移只跑一次，所以之后就算用户全被删掉也不会又跳回引导页。
 */
export class AddInstanceState1792400000000 implements MigrationInterface {
  name = 'AddInstanceState1792400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('InstanceState'))) {
      await queryRunner.query(
        `CREATE TABLE \`InstanceState\` (\`id\` int NOT NULL AUTO_INCREMENT, \`setupCompletedAt\` datetime(3) NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
      );
    }

    // 回填：老库里已经有用户 = 这个实例早就用起来了，不该再走一遍引导
    await queryRunner.query(
      `INSERT INTO \`InstanceState\` (\`setupCompletedAt\`) SELECT CURRENT_TIMESTAMP(3) FROM DUAL WHERE EXISTS (SELECT 1 FROM \`User\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('InstanceState'))) {
      return;
    }

    await queryRunner.query(`DROP TABLE \`InstanceState\``);
  }
}
