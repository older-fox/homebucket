import { Allow } from 'class-validator';

/**
 * 保存实例设置。
 *
 * `values` 的键是**环境变量名**（与 `settings.registry.ts` 的 `envName` 逐字一致），
 * 值的语义统一在这里约定清楚：
 *   · 省略某个键        → 不改它
 *   · 字符串 / 布尔 / 数字 → 设成该值（按注册表的 type 校验）
 *   · `null`            → 删除该项覆盖，回落 `.env` / 内置默认
 *   · 密钥类传空串 `''`  → 视为"不改"（界面上看不到原值，留空必须是"不改"而不是"清空"）
 *
 * 只挂 `@Allow()`：字段级校验在这里做没有意义（每一项的类型由注册表决定，
 * 不是由 DTO 决定的），实际校验在 `SettingsService.normalize()`
 * —— 那样才能按 type/min/max/enumValues 给出一致的错误码。
 * 它同时保证这个字段能穿过全局 `ValidationPipe` 的 `whitelist: true`。
 */
export class UpdateSettingsDto {
  @Allow()
  values: Record<string, unknown>;
}
