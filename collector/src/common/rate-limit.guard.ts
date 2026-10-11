import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env';
import { FixedWindowRateLimiter } from './rate-limit';

export const RATE_LIMITER = 'COLLECTOR_RATE_LIMITER';
export const SKIP_RATE_LIMIT = 'collector:skip-rate-limit';

/**
 * 标在控制器/路由上表示"不做限流"：只给管理接口用。
 * 理由：管理接口已经有 admin token 这道门，再加上限流只会在运维批量纠错时咬到自己；
 * 而公开接口（查询/注册/上报）必须限流，因为它们是匿名可达的。
 */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT, true);

/**
 * 按来源 IP 的固定窗口限流。
 *
 * 为什么按 IP 而不是按实例 key：注册接口本身就不带 key（这正是"自动注册"的前提），
 * 所以只能用 IP 兜住最粗暴的刷量；单实例的过度上报另有 instance 维度的封禁手段。
 * 为什么查询/注册/上报共用一份预算：三者的滥用形态都是"无脑高频打接口"，
 * 分开计数只会让攻击者用三倍预算达成同样效果。窗口与额度见 COLLECTOR_RATE_LIMIT*。
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(RATE_LIMITER) private readonly limiter: FixedWindowRateLimiter,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest & { ip?: string; socket?: { remoteAddress?: string } }>();
    const reply = http.getResponse<FastifyReply>();
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const decision = this.limiter.hit(ip);

    reply.header('x-ratelimit-limit', env.rateLimit);
    reply.header('x-ratelimit-remaining', decision.remaining);
    if (decision.allowed) return true;

    reply.header('retry-after', decision.retryAfterSeconds);
    throw new HttpException(
      {
        code: 'rate.tooMany',
        message: `请求过于频繁，请 ${decision.retryAfterSeconds} 秒后重试`,
        retryAfterSeconds: decision.retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
