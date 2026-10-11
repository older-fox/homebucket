import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { InstancesService } from './instances.service';
import type { RequestWithContext } from '../common/decorators';

/**
 * 上报接口的鉴权：`X-Collector-Key: hbc_...`（也接受 `Authorization: Bearer hbc_...`）。
 *
 * 两种写法都收，是为了让实例端接入时不必先搞清楚"到底用哪个头" ——
 * HomeBucket 自己两种都支持，保持一致能省掉一次试错。
 */
@Injectable()
export class InstanceKeyGuard implements CanActivate {
  constructor(private readonly instances: InstancesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & RequestWithContext & { instance?: unknown }>();
    const token = extractKey(request);
    if (!token) {
      throw new UnauthorizedException({
        code: 'instance.keyMissing',
        message: '缺少实例凭据：请用注册时拿到的 key 发 X-Collector-Key',
      });
    }
    const instance = await this.instances.authenticate(token);
    if (!instance) throw new UnauthorizedException({
      code: 'instance.keyInvalid',
      message: '实例凭据无效，请重新注册',
    });
    request.instance = instance;
    return true;
  }
}

export function extractKey(request: FastifyRequest): string | undefined {
  const header = request.headers['x-collector-key'];
  const raw = Array.isArray(header) ? header[0] : header;
  if (raw && raw.trim() !== '') return raw.trim();
  const authorization = request.headers.authorization;
  if (authorization && /^Bearer\s+/i.test(authorization)) {
    return authorization.replace(/^Bearer\s+/i, '').trim();
  }
  return undefined;
}
