import { IsEmail, IsOptional, IsString, Length, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;

  @IsString()
  @Length(2, 32, { message: '用户名长度需在 2 ~ 32 之间' })
  username: string;

  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  password: string;

  /** 通过邀请链接注册时带上，注册完成后自动加入该家庭 */
  @IsOptional()
  @IsString()
  inviteToken?: string;
}

export class LoginDto {
  @IsString()
  email: string;

  @IsString()
  password: string;
}
