import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 同 mysql/1792000000000-AddApiKeyScope.ts：给 `ApiKey` 加 `scope`（`read` / `write`）。
 *
 * 纯增量列 + 默认值 `read`：老 key（迁移前建的）不动语句就自动变成只读，
 * 与 `ApiKey.scope` 实体列的 default 一致（default 写不写括号由 schema:log 决定，
 * 括号形式与 1791900000001-AddUserProfileFields 的整数默认值同一写法）。
 */
export class AddApiKeyScope1792000000000 implements MigrationInterface {
  name = 'AddApiKeyScope1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('ApiKey', 'scope'))) {
      await queryRunner.query(
        `ALTER TABLE "ApiKey" ADD COLUMN "scope" varchar(16) NOT NULL DEFAULT ('read')`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('ApiKey', 'scope')) {
      await queryRunner.query(`ALTER TABLE "ApiKey" DROP COLUMN "scope"`);
    }
  }
}
