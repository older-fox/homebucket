import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Contribution 加一条 `(instanceId, contentHash)` 复合索引：给重复上报去重用的。
 *
 * ── 为什么要这条索引 ──
 * 定时全量上报的客户端（HomeBucket）每轮都会把没变过的物品再发一遍，服务端
 * 收到时先按"同一实例 + 同一内容指纹"查一遍，命中就直接返回已有那一条
 * （见 ContributionsService.create）。原本 `contentHash` 上已有单列索引，
 * 但去重条件是两列，带上 instanceId 就不用回表再过滤一遍。
 *
 * 下面的索引名是 TypeORM 按表名列名哈希出来的，**不要手改** —— 改了
 * `npm run db:check-drift` 会立刻报漂移。
 */

const INDEX = 'IDX_86b94714c967a07c828d42ef38';

export class ContributionDedupe1792900000000 implements MigrationInterface {
  name = 'ContributionDedupe1792900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "${INDEX}" ON "Contribution" ("instanceId", "contentHash") `,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "${INDEX}"`);
  }
}
