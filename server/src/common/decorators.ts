import { createParamDecorator, ExecutionContext, applyDecorators, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/jwt-auth.guard';
import type { ApiKeyContext } from '../api-keys/api-key.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InstanceAdminGuard } from '../auth/instance-admin.guard';
import { FamilyContext, FamilyContextGuard } from './family-context.guard';

type RequestWithContext = {
  user?: AuthUser;
  family?: FamilyContext;
  apiKey?: ApiKeyContext;
};

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

/**
 * 本次请求用的那把 API key（由 `ApiKeyGuard` 填好），JWT 请求上为 undefined。
 *
 * 用来把「这把 key 自己的 scope」回给客户端（例如 `GET /v1/me` 的 scope 字段），
 * 而不是从账号或家庭角色推断 —— 同一账号可以同时持有只读 key 与可写 key。
 */
export const CurrentApiKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ApiKeyContext | undefined => {
    const req = ctx.switchToHttp().getRequest<RequestWithContext>();
    return req.apiKey;
  },
);

/** 组合守卫：先校验 JWT，再解析并校验家庭上下文 */
export const FamilyScoped = () => applyDecorators(UseGuards(JwtAuthGuard, FamilyContextGuard));
/** 仅登录（不要求家庭上下文） */
export const Authed = () => applyDecorators(UseGuards(JwtAuthGuard));
/**
 * 实例级管理员（JWT + `isInstanceAdmin`）。
 *
 * 用在**不属于任何家庭**的全局接口上（如实例设置）：刻意不挂 FamilyContextGuard，
 * 因为那要求带 `x-family-id`，而"改这个安装的端口"跟当前选中哪个家庭无关。
 */
export const InstanceAdmin = () => applyDecorators(UseGuards(JwtAuthGuard, InstanceAdminGuard));
