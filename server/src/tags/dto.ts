import { IsOptional, IsString, Length } from 'class-validator';
import { IsOptionalNotNull } from '../common/validation';

/** 标签的入参 DTO（校验规则与原 tags.module.ts 内联版本完全一致） */

export class CreateTagDto {
  // `!` 只是类型层面的定值断言：TS 6 默认打开 strictPropertyInitialization，
  // 而编译产物（无初始值的字段声明）与 `name: string` 完全一致，运行时行为不变
  @IsString()
  @Length(1, 40)
  name: string;

  @IsOptional()
  @IsString()
  @Length(4, 9)
  color?: string;
}

export class UpdateTagDto {
  @IsOptionalNotNull()
  @IsString()
  @Length(1, 40)
  name?: string;

  @IsOptionalNotNull()
  @IsString()
  @Length(4, 9)
  color?: string;
}
