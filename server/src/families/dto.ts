import { IsInt, IsOptional, IsString, Length, Max, Min, IsBoolean } from 'class-validator';
import { IsOptionalNotNull } from '../common/validation';

export class CreateFamilyDto {
  @IsString()
  @Length(1, 60)
  name: string;
}

export class UpdateFamilyDto {
  @IsOptionalNotNull()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptionalNotNull()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptionalNotNull()
  @IsString()
  @Length(2, 20)
  locale?: string;

  @IsOptionalNotNull()
  @IsString()
  @Length(1, 60)
  timeZone?: string;
}

export class CreateInviteDto {
  /** 过期天数，留空表示永久有效 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;
}

export class UpdateMemberDto {
  @IsString()
  role: string; // admin | member
}

export class JoinFamilyDto {
  @IsOptional()
  @IsBoolean()
  switchDefault?: boolean;
}
