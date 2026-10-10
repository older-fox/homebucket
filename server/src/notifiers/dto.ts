import { IsArray, IsBoolean, IsObject, IsOptional, IsString, Length } from 'class-validator';
import { IsOptionalNotNull } from '../common/validation';
import type { NotifyConfig } from './channels/notify-channel';

/** 通知器创建入参；校验规则与拆分前完全一致（type 不做枚举校验，交给 service 判） */
export class CreateNotifierDto {
  @IsString()
  type: string;

  @IsString()
  @Length(1, 60)
  name: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @IsObject()
  config: NotifyConfig;
}

/** 通知器更新入参；所有字段可选，只覆盖出现过的字段 */
export class UpdateNotifierDto {
  @IsOptionalNotNull()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptionalNotNull()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @IsOptional()
  @IsObject()
  config?: NotifyConfig;
}
