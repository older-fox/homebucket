import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 新增 `DataCollectionState` 表：条码收集器的实例注册状态（单例行）。
 *
 * ── 为什么要这张表 ──
 * 定时全量上报用的是收集器 v1 实例协议，每次请求都要带 `x-collector-key`，
 * 而 key 是首次 `POST /api/v1/instances` 注册时**只返回一次**的。没有落库的地方，
 * 重启一次就得重新注册（收集器那边会攒下一堆孤儿实例）。
 *
 * ── ⚠️ 这表的 `instanceKey` 是明文 ──
 * 与 `ApiKey.keyHash`（只存 sha256）相反：协议要求带上 key 的字面值，存哈希就发不出请求。
 * 配套约束写在实体的注释里（不进任何接口响应、日志只打前缀、dump 视为泄露）。
 *
 * 时间列沿用既有约定：可空业务时间 `datetime(3)`，`createdAt/updatedAt` 由
 * TypeORM 按 provider 生成（MySQL 上是 datetime(6)）。
 */
export class AddDataCollectionState1792100000000 implements MigrationInterface {
  name = 'AddDataCollectionState1792100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('DataCollectionState')) {
      return;
    }

    await queryRunner.query(
      `CREATE TABLE \`DataCollectionState\` (\`id\` int NOT NULL AUTO_INCREMENT, \`instanceKey\` varchar(64) NULL, \`instanceKeyPrefix\` varchar(16) NULL, \`instanceId\` int NULL, \`instanceName\` varchar(191) NULL, \`registeredAt\` datetime(3) NULL, \`lastSyncAt\` datetime(3) NULL, \`lastErrorCode\` varchar(64) NULL, \`lastErrorAt\` datetime(3) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('DataCollectionState'))) {
      return;
    }

    await queryRunner.query(`DROP TABLE \`DataCollectionState\``);
  }
}
