import { IsEmail, IsInt, IsOptional, IsString, Length, Max, Min, MinLength } from 'class-validator';

export class RegisterDto {
  /** 用户名即登录账号 */
  @IsString()
  @Length(2, 32, { message: '用户名长度需在 2 ~ 32 之间' })
  username: string;

  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  password: string;

  /** 邮箱选填：仅用于通知/找回，不再作为登录凭据 */
  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  email?: string;

  /** 通过邀请链接注册时带上，注册完成后自动加入该家庭 */
  @IsOptional()
  @IsString()
  inviteToken?: string;
}

export class LoginDto {
  /** 登录账号：用户名 */
  @IsString()
  @Length(2, 32, { message: '用户名长度需在 2 ~ 32 之间' })
  username: string;

  @IsString()
  password: string;
}

/** 账号资料（头像 + 「取走过久」提醒阈值）：只允许改自己的这两项 */
export class UpdateProfileDto {
  /** 取走过久提醒阈值（天）：0 = 关闭提醒 */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  takenOutAlertDays?: number;

  /** 头像附件 id（来自 POST /uploads）；显式传 null 表示清空头像 */
  @IsOptional()
  @IsInt()
  @Min(1)
  avatarId?: number | null;
}
