import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { env } from '../config/env';
import { GATE_ALLOWED_PREFIXES, matchesPrefix, normalizeApiPath } from './setup-paths';
import { SetupStateService } from './setup-state.service';

/**
 * 引导门禁：初始化没完成时，除白名单外的一切业务接口都回 503 `setup.required`。
 *
 * 为什么要有它（前端已经有中间件会跳转了）：前端能重定向，但**接口不能只靠前端守**。
 * 一个还没定管理员的实例，任何人直接 curl 都能建家庭、写物品 —— 门禁必须落在服务端。
 *
 * 只注册在正常模式的根模块里（受限启动时没有库，读不到完成标记，那边由
 * `SetupRequiredMiddleware` 全量拦截）。
 */
@Injectable()
export class SetupGateGuard implements CanActivate {
  constructor(private readonly state: SetupStateService) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.state.isCompleted) return true;

    const request = context.switchToHttp().getRequest<{ originalUrl?: string; url?: string }>();
    const pathname = normalizeApiPath(request.originalUrl ?? request.url ?? '', env.apiPrefix);
    if (matchesPrefix(pathname, GATE_ALLOWED_PREFIXES)) return true;

    throw new ServiceUnavailableException({
      code: 'setup.required',
      message: '实例尚未完成初始化，请先完成引导',
    });
  }
}
