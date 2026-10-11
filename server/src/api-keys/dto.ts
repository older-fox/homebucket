import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { API_KEY_SCOPES, type ApiKeyScope } from '../entities/api-key.entity';

export class CreateApiKeyDto {
  /** 备注名，例如「Home Assistant」「备份脚本」 */
  @IsString()
  @Length(1, 50)
  name: string;

  /**
   * 权限范围：`read`（默认，只能读）或 `write`（额外可写物品）。
   *
   * 不传就是 `read` —— 接口与界面都按最小权限默认，想要写必须显式声明。
   * 枚举值来自实体里的 `API_KEY_SCOPES`，避免 DTO 与鉴权各写一份。
   */
  @IsOptional()
  @IsIn(API_KEY_SCOPES)
  scope?: ApiKeyScope;

  /**
   * 可选到期时间：`YYYY-MM-DD` 或完整 ISO 字符串；不传 = 永不过期。
   *
   * 为什么不用 @IsDateString：`validation.*` 文案表里没有 isDateString 这一项
   * （见 server/test/locale-coverage.test.mjs 的约束名↔文案检查），
   * 这里用 @Matches 卡格式，语义校验（能不能解析、是否已过期）交给 service，
   * 报错走 apiKey.invalidExpiry。
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z?)?$/)
  expiresAt?: string;
}
