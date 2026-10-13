import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { matchesPrefix, normalizeApiPath, RESTRICTED_ALLOWED_PREFIXES } from './setup-paths';

/**
 * 受限启动（连不上库）时的总闸：除白名单外的**一切** `/api/**` 都回 503 `setup.required`。
 *
 * 为什么要这道闸而不是靠"没有路由自然 404"：404 会让前端把它当成前端路由错误
 * （Nuxt 的代理把状态码原样透传，`useApi` 会翻成 `errors.notFound`），而这个实例
 * 的真实状态是"还没初始化"。回一个可识别的业务码，前端才能统一跳引导页。
 */
@Injectable()
export class SetupRequiredMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const pathname = normalizeApiPath(request.originalUrl ?? request.url ?? '', env.apiPrefix);

    if (matchesPrefix(pathname, RESTRICTED_ALLOWED_PREFIXES)) {
      next();
      return;
    }

    response.status(503).json({
      statusCode: 503,
      code: 'setup.required',
      message: '实例尚未完成初始化，请先完成引导',
    });
  }
}
