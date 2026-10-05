import { createParamDecorator, ExecutionContext, applyDecorators, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FamilyContext, FamilyContextGuard } from './family-context.guard';

type RequestWithContext = { user?: AuthUser; family?: FamilyContext };

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<RequestWithContext>();
    return req.user as AuthUser;
  },
);

export const CurrentFamily = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): FamilyContext => {
    const req = ctx.switchToHttp().getRequest<RequestWithContext>();
    return req.family as FamilyContext;
  },
);

/** 组合守卫：先校验 JWT，再解析并校验家庭上下文 */
export const FamilyScoped = () => applyDecorators(UseGuards(JwtAuthGuard, FamilyContextGuard));

/** 仅登录（不要求家庭上下文） */
export const Authed = () => applyDecorators(UseGuards(JwtAuthGuard));

export const FamilyRoles = {
  isOwner: (ctx?: FamilyContext) => ctx?.role === 'owner',
  canManage: (ctx?: FamilyContext) => ctx?.role === 'owner' || ctx?.role === 'admin',
};
