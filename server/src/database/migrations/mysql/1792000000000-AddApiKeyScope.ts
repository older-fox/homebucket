import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * API key 权限范围：给 `ApiKey` 加 `scope`（`read` / `write`）。
 *
 * - `read`（默认）：只能调 v1 的 GET 路由；
 * - `write`：额外允许物品相关写接口（改属性、增删物品、序列号、取走/归还、消耗/补货）。
 *
 * 默认值 `read` 是有意的：老库里的 key 迁移后仍是只读，要写必须重新建一把，
 * 避免"升级一次就给所有历史 key 开了写权限"。列长度 16 够放两个枚举值，
 * 与实体 `ApiKey.scope` 的 `varchar(16) default 'read'` 对齐。
 */
export class AddApiKeyScope1792000000000 implements MigrationInterface {
  name = 'AddApiKeyScope1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('ApiKey', 'scope'))) {
      await queryRunner.query(
        `ALTER TABLE \`ApiKey\` ADD COLUMN \`scope\` varchar(16) NOT NULL DEFAULT 'read'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('ApiKey', 'scope')) {
      await queryRunner.query(`ALTER TABLE \`ApiKey\` DROP COLUMN \`scope\``);
    }
  }
}
