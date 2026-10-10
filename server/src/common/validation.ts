import { ValidateIf, type ValidationError, type ValidationOptions } from 'class-validator';

export interface ValidationField {
  field: string;
  constraints: string[];
}

/**
 * 「可省略但不可为 null」：字段缺省（undefined）时跳过校验；显式传 null 仍会
 * 交给后面的校验器，从而被拒绝（400），而不是一路穿过 DTO 到 service 再抛 500。
 *
 * 为什么需要它：class-validator 的 @IsOptional() 对 null 也跳过校验，于是
 * `{"name": null}` / `{"tagIds": null}` 会绕过校验直达 service，撞上 NOT NULL 列或
 * `x.trim()` / `x.length`，变成 Internal server error。
 *
 * 适用范围：只用在「一旦出现就必须是合法值」的字段上（NOT NULL 列、会被解引用的
 * 列表等）；真正可空、允许用 null 清空的字段（description / locationId / note …）
 * 继续用 @IsOptional()。
 */
export function IsOptionalNotNull(options?: ValidationOptions) {
  return ValidateIf((_object, value) => value !== undefined, options);
}

/** 把 class-validator 的错误拍平成「字段 + 约束名」，前端按约束名查多语言文案 */
export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): ValidationField[] {
  const result: ValidationField[] = [];

  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      result.push({ field, constraints: Object.keys(error.constraints) });
    }
    if (error.children?.length) {
      result.push(...flattenValidationErrors(error.children, field));
    }
  }

  return result;
}
