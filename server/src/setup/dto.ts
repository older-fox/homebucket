import { Allow } from 'class-validator';

/**
 * 引导页第 1 步提交的数据库连接参数。
 *
 * `provider` 决定其余字段哪些有意义：
 *   · mysql  → url（可选，整串）与 host/port/username/password/database
 *   · sqlite → filePath
 *
 * 只挂 `@Allow()`、把校验放在 `SetupService.normalize()` 里：这里要按 provider 分支校验，
 * 用 DTO 装饰器表达会绕很多弯，而且每个装饰器都要配一条 `validation.*` 文案。
 */
export class DatabaseConfigDto {
  @Allow() provider?: unknown;
  @Allow() url?: unknown;
  @Allow() host?: unknown;
  @Allow() port?: unknown;
  @Allow() username?: unknown;
  @Allow() password?: unknown;
  @Allow() database?: unknown;
  @Allow() filePath?: unknown;
}
