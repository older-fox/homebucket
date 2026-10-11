import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/**
 * 请求上下文里的自定义挂载点：守卫写入、控制器参数装饰器读取。
 * 控制器因此不必关心凭据是怎么解析出来的，只关心业务参数。
 */

/** 通过实例 key 鉴权后的上报方 */
export interface InstanceContext {
  id: number;
  name: string;
  keyPrefix: string;
}

export interface RequestWithContext {
  instance?: InstanceContext;
  /** Fastify 会填；某些代理场景下可能只有 socket 地址 */
  ip?: string;
  socket?: { remoteAddress?: string };
  headers: Record<string, string | string[] | undefined>;
}

/** 取当前上报方（仅在使用 InstanceKeyGuard 的路由上可用） */
export const CurrentInstance = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): InstanceContext | undefined =>
    ctx.switchToHttp().getRequest<RequestWithContext>().instance,
);

/**
 * 取客户端 IP（限流、审计用）。
 * app.factory 里打开了 trustProxy，所以反代场景下 req.ip 是 X-Forwarded-For 的第一跳；
 * 没有反代时就是直连地址。两者都拿不到时统一归到 'unknown'，
 * 让这类请求共享一个桶 —— 而不是意外绕过限流。
 */
export const ClientIp = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<RequestWithContext>();
  return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
});
