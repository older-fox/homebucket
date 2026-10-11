import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { ApiKeysService } from './api-keys.service';

/**
 * v1 只读接口的鉴权：把明文 API key 换成 `req.user`，之后 FamilyContextGuard 照常
 * 按 `x-family-id` 解析家庭与角色 —— 也就是说 key 能看到的范围与该账号本人完全一致。
 *
 * 与 JwtAuthGuard 的区别（为什么不能复用它）：JWT 是应用自身的会话凭据，而 API key 是
 * 给脚本/外部程序用的长期凭据，需要额外校验撤销与过期状态，并且每次都要刷新 lastUsedAt。
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthUser;
    }>();

    // 两种传法都收：`X-Api-Key: hb_xxx`（推荐）与 `Authorization: Bearer hb_xxx`
    // （不少 HTTP 客户端/Home Assistant 配置里只方便设一个 Authorization 头）
    const rawHeader = req.headers['x-api-key'];
    const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const authorization = req.headers.authorization;
    const bearer =
      typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice(7).trim()
        : '';
    const token = (headerValue ?? bearer).trim();

    if (!token) throw new UnauthorizedException({ code: 'apiKey.missing', message: '缺少 API key' });

    const user = await this.apiKeys.authenticate(token);
    if (!user) {
      throw new UnauthorizedException({ code: 'apiKey.invalid', message: 'API key 无效、已撤销或已过期' });
    }

    req.user = user;
    return true;
  }
}
