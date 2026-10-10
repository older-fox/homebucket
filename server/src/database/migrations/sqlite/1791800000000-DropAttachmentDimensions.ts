import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 同 mysql/1791800000000-DropAttachmentDimensions.ts：删掉 Attachment 的两个死列
 * `width` / `height`（没有任何写入方与读取方，是 Prisma 时代留下的）。
 *
 * 用 hasColumn 守卫，使它在「全新库（Init 已不含这两列）」「早期版本的库」「Prisma 老库」
 * 三种情况下都是幂等的。DROP COLUMN 需要 SQLite ≥ 3.35，better-sqlite3 内置的版本远高于此。
 */
export class DropAttachmentDimensions1791800000000 implements MigrationInterface {
  name = 'DropAttachmentDimensions1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('Attachment', 'width')) {
      await queryRunner.query(`ALTER TABLE "Attachment" DROP COLUMN "width"`);
    }
    if (await queryRunner.hasColumn('Attachment', 'height')) {
      await queryRunner.query(`ALTER TABLE "Attachment" DROP COLUMN "height"`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('Attachment', 'width'))) {
      await queryRunner.query(`ALTER TABLE "Attachment" ADD COLUMN "width" integer`);
    }
    if (!(await queryRunner.hasColumn('Attachment', 'height'))) {
      await queryRunner.query(`ALTER TABLE "Attachment" ADD COLUMN "height" integer`);
    }
  }
}
