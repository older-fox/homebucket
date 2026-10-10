import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 物品与单件新增 `takenOutAt`：扫码浮窗「取走 / 放回」的状态位。
 *
 * 为什么两张表都要加：
 *   扫码解析出来的目标可能是整件物品（命中商品条码 / 追溯码 / 物品二维码），
 *   也可能是某一条 SN（命中序列号）。状态必须记在"码所指向的那个对象"上，
 *   否则三台风扇只借出去一台时，整件物品的状态就会说谎。
 *
 * 可空、无默认值：NULL 表示在库，这正是绝大多数历史数据应有的语义，
 * 所以不需要回填数据，加列即可。
 */
export class AddTakenOutAt1791303000000 implements MigrationInterface {
  name = 'AddTakenOutAt1791303000000';

  /**
   * 逐列判断后再补：老库（Prisma 时代）里 `Item.takenOutAt` 可能已经存在，
   * 而 `ItemUnit.takenOutAt` 没有。若第一条 ALTER 就因 "Duplicate column name" 失败，
   * 整个迁移会中断，缺的那一列反而永远补不上（且迁移记录不会写入）。
   * 因此两列都各自先 hasColumn 判断，存在则跳过。
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('Item', 'takenOutAt'))) {
      await queryRunner.query(`ALTER TABLE \`Item\` ADD \`takenOutAt\` datetime(3) NULL`);
    }
    if (!(await queryRunner.hasColumn('ItemUnit', 'takenOutAt'))) {
      await queryRunner.query(`ALTER TABLE \`ItemUnit\` ADD \`takenOutAt\` datetime(3) NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('Item', 'takenOutAt')) {
      await queryRunner.query(`ALTER TABLE \`Item\` DROP COLUMN \`takenOutAt\``);
    }
    if (await queryRunner.hasColumn('ItemUnit', 'takenOutAt')) {
      await queryRunner.query(`ALTER TABLE \`ItemUnit\` DROP COLUMN \`takenOutAt\``);
    }
  }
}
