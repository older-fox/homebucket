import type { ValidationError } from 'class-validator';

export interface ValidationField {
  field: string;
  constraints: string[];
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
