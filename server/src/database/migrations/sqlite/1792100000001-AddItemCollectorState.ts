import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 同 mysql/1792100000001-AddItemCollectorState.ts：给 `Item` 加三列上报状态。
 *
 * SQLite 的 `ALTER TABLE ADD COLUMN` 加可空列是安全的（不需要 DEFAULT），
 * 所以不用走"建临时表 → 搬数据 → 改名"那一套；1792000000000-AddApiKeyScope 也是这个写法。
 */
export class AddItemCollectorState1792100000001 implements MigrationInterface {
  name = 'AddItemCollectorState1792100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('Item', 'collectorFingerprint'))) {
      await queryRunner.query(`ALTER TABLE "Item" ADD COLUMN "collectorFingerprint" varchar(64)`);
    }
    if (!(await queryRunner.hasColumn('Item', 'collectorSyncedAt'))) {
      await queryRunner.query(`ALTER TABLE "Item" ADD COLUMN "collectorSyncedAt" datetime(3)`);
    }
    if (!(await queryRunner.hasColumn('Item', 'collectorPhotoSyncedAt'))) {
      await queryRunner.query(`ALTER TABLE "Item" ADD COLUMN "collectorPhotoSyncedAt" datetime(3)`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SQLite 支持 DROP COLUMN（3.35+）；老版本上这条会失败，但 down 只在回滚时用得到
    for (const column of ['collectorFingerprint', 'collectorSyncedAt', 'collectorPhotoSyncedAt']) {
      if (await queryRunner.hasColumn('Item', column)) {
        await queryRunner.query(`ALTER TABLE "Item" DROP COLUMN "${column}"`);
      }
    }
  }
}
