import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppModule } from './app.module';
import { env } from './config/env';
import { runMigrations } from './database/auto-migrate';
import { flattenValidationErrors, firstValidationMessage } from './common/validation';
import { registerSpa } from './static/spa';

/**
 * 组装应用（与 main.ts 分开，是为了让测试能直接拿一个"没在监听端口"的实例，
 * 用 Fastify 的 inject() 打请求 —— 端到端测试不需要真的占一个端口）。
 */
export async function createApp(options: { migrate?: boolean } = {}): Promise<NestFastifyApplication> {
  if (options.migrate !== false && env.autoMigrate) {
    const executed = await runMigrations();
    if (executed > 0) {
      // eslint-disable-next-line no-console
      console.log(`[collector] 已执行 ${executed} 个迁移`);
    }
  }

  const adapter = new FastifyAdapter({
    bodyLimit: env.maxBodySize,
    // 部署在 nginx/cloudflare 后面时，req.ip 必须来自 X-Forwarded-For，
    // 否则限流会把所有实例算成同一个 IP（= 全站共用一个额度）
    trustProxy: true,
    disableRequestLogging: env.isProduction,
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    logger: ['error', 'warn', 'log'],
  });

  app.setGlobalPrefix(env.apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      exceptionFactory: (errors) => {
        const fields = flattenValidationErrors(errors);
        return new BadRequestException({
          code: 'validation.failed',
          message: firstValidationMessage(fields),
          fields,
        });
      },
    }),
  );

  const fastify = app.getHttpAdapter().getInstance() as unknown as {
    addHook: (
      name: 'onRequest',
      handler: (request: FastifyRequest, reply: FastifyReply) => Promise<void>,
    ) => void;
  };
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const origin = request.headers.origin;
    if (!origin) return;
    const allowed = resolveCorsOrigin(origin);
    if (!allowed) return;
    reply.header('access-control-allow-origin', allowed);
    reply.header('vary', 'origin');
    reply.header('access-control-allow-headers', 'content-type,x-collector-key,x-admin-token');
    reply.header('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    reply.header('access-control-max-age', '600');
    if (request.method === 'OPTIONS') {
      await reply.code(204).send();
    }
  });

  await app.init();
  // 静态与 SPA 回退必须在 Nest 注册完路由之后挂：否则 notFoundHandler 会被后来的路由"绕过"
  await registerSpa(app);
  return app;
}

/**
 * CORS：默认 `*`（这是公共只读资料库，浏览接口本来就该被任意站点调用）。
 * 收紧时填白名单，未命中的来源**不回** CORS 头（而不是回一个错误的头让浏览器困惑）。
 */
function resolveCorsOrigin(origin: string): string | null {
  if (env.corsOrigin === '*') return '*';
  return env.corsOrigin.includes(origin) ? origin : null;
}
