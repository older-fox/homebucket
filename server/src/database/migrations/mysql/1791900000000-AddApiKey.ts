import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * API key：新增 `ApiKey` 表（给脚本 / 外部程序用的只读凭据）。
 *
 * 只存 `keyHash` = sha256(明文 token) 的十六进制摘要，明文只在创建时返回一次，库里不留；
 * 因此这一列必须按**字节**比较（utf8mb4_bin），与其它唯一字符串列一致 ——
 * 理由见 `1791800000001-BinaryUniqueCollation.ts`（MySQL 默认排序规则不区分大小写，
 * 而 SQLite 的 UNIQUE 是 BINARY 比较）。全新安装直接建表就带上这个排序规则，
 * 所以不需要再往那份 BINARY_UNIQUES 清单里加。
 *
 * `userId` 归属账号而不是家庭：key 能看到的家庭/角色与该账号本人完全一致，
 * 当前家庭仍由请求头 `X-Family-Id` 决定；账号删除时 key 一并级联删除。
 */
export class AddApiKey1791900000000 implements MigrationInterface {
  name = 'AddApiKey1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('ApiKey')) {
      return;
    }

    await queryRunner.query(
      `CREATE TABLE \`ApiKey\` (\`id\` int NOT NULL AUTO_INCREMENT, \`userId\` int NOT NULL, \`name\` varchar(191) NOT NULL, \`prefix\` varchar(32) NOT NULL, \`keyHash\` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, \`lastUsedAt\` datetime(3) NULL, \`expiresAt\` datetime(3) NULL, \`revokedAt\` datetime(3) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_7bc072c14b0d0362238790af8f\` (\`userId\`), UNIQUE INDEX \`IDX_150944bfb61672273d440e2d24\` (\`keyHash\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`ApiKey\` ADD CONSTRAINT \`FK_7bc072c14b0d0362238790af8f4\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('ApiKey'))) {
      return;
    }

    // 外键与两个索引都随表一起消失，不需要单独 DROP
    await queryRunner.query(`DROP TABLE \`ApiKey\``);
  }
}
