import type { H3Event } from 'h3';

/**
 * HTTP 层：错误信封 + 处理器包装。
 *
 * ── 为什么保留"Nest 形状"的错误体 ──
 * 迁移前客户端（以及我写的那批端到端脚本）认的是
 *   `{ statusCode, code, message, fields? }`
 * 其中 `code` 是机器可读的错误码（`item.notFound`、`validation.failed`…），
 * 前端据此说人话。换框架不该顺手换掉对外契约，所以这里逐字保持。
 *
 * ── 为什么不抛 h3 的 createError ──
 * createError 的响应体由框架拼（statusMessage/message/stack），要精确控制
 * `code` 与 `fields` 反而更绕。这里直接在事件上设状态码、返回体，
 * 未知异常统一 500 且**不把堆栈回给调用方**。
 */
export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly fields?: FieldError[],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  body(): Record<string, unknown> {
    const body: Record<string, unknown> = {
      statusCode: this.statusCode,
      code: this.code,
      message: this.message,
    };
    if (this.fields && this.fields.length > 0) body.fields = this.fields;
    return body;
  }
}

export const badRequest = (code: string, message: string, fields?: FieldError[]): ApiError =>
  new ApiError(400, code, message, fields);
export const unauthorized = (code: string, message: string): ApiError =>
  new ApiError(401, code, message);
export const forbidden = (code: string, message: string): ApiError => new ApiError(403, code, message);
export const notFound = (code: string, message: string): ApiError => new ApiError(404, code, message);
export const conflict = (code: string, message: string): ApiError => new ApiError(409, code, message);
export const tooManyRequests = (code: string, message: string): ApiError =>
  new ApiError(429, code, message);
export const payloadTooLarge = (code: string, message: string): ApiError =>
  new ApiError(413, code, message);

/** 未预期异常统一记服务端日志、回固定文案：绝不把堆栈或 SQL 泄漏给调用方 */
export const INTERNAL_ERROR = {
  statusCode: 500,
  code: 'internal.error',
  message: '服务器内部错误',
} as const;

/**
 * 包装路由处理器：把 ApiError 落成对外的错误信封，其余异常落成 500。
 * 返回体直接 `return`（而不是 throw），这样状态码与 body 完全由这里决定。
 */
export function apiHandler<T>(
  handler: (event: H3Event) => Promise<T> | T,
): (event: H3Event) => Promise<T | Record<string, unknown> | null> {
  return defineEventHandler(async (event) => {
    try {
      const result = await handler(event);
      return result === undefined ? null : result;
    } catch (error) {
      if (error instanceof ApiError) {
        setResponseStatus(event, error.statusCode);
        return error.body();
      }
      console.error('[collector] 未处理的错误', error);
      setResponseStatus(event, INTERNAL_ERROR.statusCode);
      return { ...INTERNAL_ERROR };
    }
  });
}

/** 读 JSON body：非法 JSON 按 validation.failed 报，而不是抛框架异常 */
export async function readJsonBody<T>(event: H3Event): Promise<T> {
  try {
    const body = await readBody(event);
    if (body === undefined || body === null) return {} as T;
    if (typeof body !== 'object' || Array.isArray(body)) {
      throw badRequest('validation.failed', '请求体必须是一个 JSON 对象');
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw badRequest('validation.failed', '请求体不是合法的 JSON');
  }
}

/** 查询参数（字符串），空串按未提供处理 */
export function queryString(event: H3Event, name: string): string | undefined {
  const value = getQuery(event)[name];
  if (value === undefined || value === null) return undefined;
  const text = Array.isArray(value) ? String(value[0] ?? '') : String(value);
  return text.trim() === '' ? undefined : text;
}
