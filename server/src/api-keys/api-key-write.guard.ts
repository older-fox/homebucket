import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { ApiKeyContext } from './api-key.guard';

/**
 * 写接口的权限闸门：只放行 `scope: 'write'` 的 key。
 *
 * 必须挂在 `ApiKeyGuard` **之后**（`@UseGuards(ApiKeyGuard, ApiKeyWriteGuard)`，
 * Nest 按声明顺序执行）：它读的是上一个 guard 填好的 `req.apiKey`。
 * 如果 `req.apiKey` 缺失（说明这个守卫被单独挂到了没有 ApiKeyGuard 的路由上），
 * 一律按拒绝处理 —— 配置错误不该变成权限漏洞。
 *
 * 返回 403 而不是 401：key 本身是有效的，只是权限不够；401 会让客户端误以为要换 key。
 */
@Injectable()
export class ApiKeyWriteGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ apiKey?: ApiKeyContext }>();

    if (req.apiKey?.scope !== 'write') {
      throw new ForbiddenException({
        code: 'apiKey.readOnly',
        message: '这把 API key 只有只读权限，不能写物品',
      });
    }
    return true;
  }
}
