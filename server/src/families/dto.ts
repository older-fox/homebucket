import { IsInt, IsOptional, IsString, Length, Max, Min, IsBoolean } from 'class-validator';

export class CreateFamilyDto {
  @IsString()
  @Length(1, 60)
  name: string;
}

export class UpdateFamilyDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsString()
  @Length(2, 20)
  locale?: string;

  @IsOptional()
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
