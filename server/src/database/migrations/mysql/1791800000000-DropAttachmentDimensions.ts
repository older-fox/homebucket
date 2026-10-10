import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 删掉 Attachment 的两个死列 `width` / `height`。
 *
 * 依据：全仓没有任何地方写入它们（`uploads.service.ts` 存附件时只填
 * familyId/key/url/mime/size/uploadedById），也没有任何读取方 ——
 * 是 Prisma 时代留下的死列，审计时按「死列」清理。
 *
 * 为什么要守卫：全新安装由 Init 建表（已经不含这两列），Prisma 老库与
 * 早期版本的库还留着它们。逐列判断存在性，让同一条迁移在三种库上都是幂等的。
 */
export class DropAttachmentDimensions1791800000000 implements MigrationInterface {
  name = 'DropAttachmentDimensions1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('Attachment', 'width')) {
      await queryRunner.query(`ALTER TABLE \`Attachment\` DROP COLUMN \`width\``);
    }
    if (await queryRunner.hasColumn('Attachment', 'height')) {
      await queryRunner.query(`ALTER TABLE \`Attachment\` DROP COLUMN \`height\``);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('Attachment', 'width'))) {
      await queryRunner.query(`ALTER TABLE \`Attachment\` ADD COLUMN \`width\` int NULL`);
    }
    if (!(await queryRunner.hasColumn('Attachment', 'height'))) {
      await queryRunner.query(`ALTER TABLE \`Attachment\` ADD COLUMN \`height\` int NULL`);
    }
  }
}
