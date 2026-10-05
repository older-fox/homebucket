import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface AuthUser {
  id: number;
  /** 邮箱可能为空（不再作为登录凭据） */
  email: string | null;
  username: string;
}

/** 从 Authorization: Bearer <token> 解析并校验 JWT，通过后把用户信息挂到 req.user */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: AuthUser }>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    if (!token) throw new UnauthorizedException({ code: 'auth.missingToken', message: '缺少登录凭证' });

    try {
      const payload = await this.jwt.verifyAsync<{ sub: number; email: string | null; username: string }>(token);
      req.user = { id: payload.sub, email: payload.email, username: payload.username };
      return true;
    } catch {
      throw new UnauthorizedException({ code: 'auth.invalidToken', message: '登录凭证无效或已过期' });
    }
  }
}
