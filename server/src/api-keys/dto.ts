import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateApiKeyDto {
  /** 备注名，例如「Home Assistant」「备份脚本」 */
  @IsString()
  @Length(1, 50)
  name: string;

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
