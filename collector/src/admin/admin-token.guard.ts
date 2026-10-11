import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { env } from '../config/env';

/**
 * 管理鉴权：`X-Admin-Token: <COLLECTOR_ADMIN_TOKEN>`。
 *
 * 为什么不是账号体系：纠错台的使用者就是部署者自己（或极小的运维小组），
 * 为一个人建用户表 + 登录态 + 重置密码，代价远大于收益。一个环境变量令牌 + 常量时间比较，
 * 在"私有部署的公共资料库"这个场景下是合适的强度。
 * 比较用 timingSafeEqual：避免用响应时间逐字节试出令牌（长度不同先补零）。
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const header = request.headers['x-admin-token'];
    const raw = Array.isArray(header) ? header[0] : header;
    const token = (raw ?? '').trim();
    if (!token) {
      throw new UnauthorizedException({
        code: 'admin.tokenMissing',
        message: '缺少管理令牌：请在纠错台里填入 X-Admin-Token',
      });
    }
    if (!safeEqual(token, env.adminToken)) {
      throw new UnauthorizedException({
        code: 'admin.tokenInvalid',
        message: '管理令牌不正确',
      });
    }
    return true;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) {
    // 长度不同也要走一次比较，避免"长度不对立刻返回"泄露长度信息
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}
