import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 给 `Item` 加三列条码收集的上报状态：`collectorFingerprint`、`collectorSyncedAt`、
 * `collectorPhotoSyncedAt`。
 *
 * 全是**可空**列，不需要回填：老物品视为"从没报过"，下一轮定时任务自然会挑上它们。
 * 没加索引 —— 定时任务按"指纹不同 / 为空"扫全表，库里物品量级下用不到，
 * 加了反而让每次写入多维护一个 B-tree。
 *
 * 为什么不用 `NOT NULL DEFAULT ''`：`collectorFingerprint` 为空表示"没报过"，
 * 而空字符串会跟"报过且内容为空"混淆，语义上必须能区分。
 */
export class AddItemCollectorState1792100000001 implements MigrationInterface {
  name = 'AddItemCollectorState1792100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('Item', 'collectorFingerprint'))) {
      await queryRunner.query(
        `ALTER TABLE \`Item\` ADD COLUMN \`collectorFingerprint\` varchar(64) NULL`,
      );
    }
    if (!(await queryRunner.hasColumn('Item', 'collectorSyncedAt'))) {
      await queryRunner.query(`ALTER TABLE \`Item\` ADD COLUMN \`collectorSyncedAt\` datetime(3) NULL`);
    }
    if (!(await queryRunner.hasColumn('Item', 'collectorPhotoSyncedAt'))) {
      await queryRunner.query(
        `ALTER TABLE \`Item\` ADD COLUMN \`collectorPhotoSyncedAt\` datetime(3) NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of ['collectorFingerprint', 'collectorSyncedAt', 'collectorPhotoSyncedAt']) {
      if (await queryRunner.hasColumn('Item', column)) {
        await queryRunner.query(`ALTER TABLE \`Item\` DROP COLUMN \`${column}\``);
      }
    }
  }
}
