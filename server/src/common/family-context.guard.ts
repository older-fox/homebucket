import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/jwt-auth.guard';

export interface FamilyContext {
  id: number;
  role: string;
  userId: number;
}

/**
 * 家庭上下文：校验 X-Family-Id 是否属于当前用户，缺省回退到用户的个人家庭。
 * 业务代码必须使用 ctx.family.id 过滤数据，保证多家庭之间数据隔离。
 */
@Injectable()
export class FamilyContextGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthUser;
      family?: FamilyContext;
    }>();

    const user = req.user;
    if (!user) throw new UnauthorizedException({ code: 'auth.missingToken', message: '缺少登录凭证' });

    const raw = req.headers['x-family-id'];
    const headerValue = Array.isArray(raw) ? raw[0] : raw;
    const familyId = headerValue ? Number(headerValue) : NaN;

    const membership = Number.isInteger(familyId)
      ? await this.prisma.familyMember.findUnique({
          where: { familyId_userId: { familyId, userId: user.id } },
          select: { familyId: true, role: true },
        })
      : ((await this.prisma.familyMember.findFirst({
          where: { userId: user.id },
          orderBy: [{ family: { isPersonal: 'desc' } }, { id: 'asc' }],
          select: { familyId: true, role: true },
        })) ?? null);

    if (!membership) throw new ForbiddenException({ code: 'family.accessDenied', message: '无权访问该家庭的数据' });

    req.family = { id: membership.familyId, role: membership.role, userId: user.id };
    return true;
  }
}
