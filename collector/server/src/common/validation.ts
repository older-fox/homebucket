import type { ValidationError } from 'class-validator';

/**
 * 把 class-validator 的嵌套错误拍平成 { 字段: [消息] }。
 *
 * 与 HomeBucket 主服务的 ValidationPipe 用同一种响应形状，方便各实例复用
 * 同一套错误处理代码：
 *   { code: 'validation.failed', message: '...', fields: { barcode: ['...'] } }
 */
export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const error of errors) {
    const path = parent === '' ? error.property : `${parent}.${error.property}`;
    const messages = Object.values(error.constraints ?? {});
    if (messages.length > 0) fields[path] = messages;
    if (error.children && error.children.length > 0) {
      Object.assign(fields, flattenValidationErrors(error.children, path));
    }
  }
  return fields;
}

/** 从拍平后的错误里取一句人能读的话（用于错误 message 与日志） */
export function firstValidationMessage(fields: Record<string, string[]>): string {
  for (const [field, messages] of Object.entries(fields)) {
    if (messages.length > 0) return `${field}: ${messages[0]}`;
  }
  return '请求参数校验失败';
}
