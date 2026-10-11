import { Logger, type INestApplication } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env';

const logger = new Logger('Static');

/**
 * 同进程托管前端（Vue 3 + Vite 的构建产物）。
 *
 * 为什么不用两个容器/两次部署：这个服务刻意做成"一个二进制、一条命令起全栈"，
 * 联调时（HomeBucket 实例向它汇报）也少一个跨域、少一个端口。
 *
 * 三个细节：
 * 1. `wildcard: false` —— 让 @fastify/static 只提供 `reply.sendFile()`，不注册 `/*` 路由，
 *    这样它不会和 API 路由抢匹配（Fastify 的静态路由优先级虽然通常没问题，
 *    但"路由表里没有 /* 通配"是无歧义的，排查路由问题时省心）。
 * 2. 找不到的路径分两类：`/api/**` 回 JSON 404（接口拼错时应该看到 JSON 而不是 HTML），
 *    其它 GET 回 index.html（SPA 的 history 路由：/items/123 刷新也要能打开）。
 * 3. 生产才加长缓存；开发（vite dev server 通过代理联调）不要缓存 index.html，
 *    否则改完前端还得手动清缓存。
 */
export async function registerSpa(app: NestFastifyApplication): Promise<boolean> {
  const root = env.webDir;
  const indexFile = join(root, 'index.html');
  if (!existsSync(indexFile)) {
    logger.warn(
      `未找到前端构建产物（${indexFile}），本次只提供 API。` +
        '开发时请用 web 的 vite dev server；部署前先构建 collector/web。',
    );
    // 即使没有前端，也要把"未知地址回 JSON"装上：只提供 API 时，
    // 调用方拿到 HTML 的 404 只会更困惑。
    installFallbackRoute(app, { serveSpa: false });
    return false;
  }

  await app.register(fastifyStatic, {
    root,
    wildcard: false,
    index: false,
    maxAge: env.isProduction ? '1h' : 0,
    etag: true,
  });

  installFallbackRoute(app, { serveSpa: true });

  logger.log(`前端静态产物已挂载：${root}`);
  return true;
}

/**
 * 未命中任何路由时的处理。
 *
 * ── 为什么是"注册一条 GET 通配路由"而不是 setNotFoundHandler ──
 * Nest 的 Fastify 适配器在 app.init() 里**已经**装了自己的 notFoundHandler
 * （用于把未命中路由变成 NotFoundException），再调 setNotFoundHandler 会直接抛
 * `Not found handler already set`。所以这里注册一条 `GET /*` 兜底路由：
 * Fastify 的路由表优先匹配更具体的静态路由，未命中的 GET 才落到这里。
 *
 * 规则：
 * - `/api/**` 一律回 JSON 404（接口拼错时要看到 JSON，而不是一份 HTML）
 * - serveSpa 时回 index.html（前端 history 路由刷新可用），否则 JSON 404
 * - 非 GET 请求不在这里兜底，交给 Nest 的 404（同样是 JSON）
 */
function installFallbackRoute(app: NestFastifyApplication, options: { serveSpa: boolean }): void {
  const fastify = app.getHttpAdapter().getInstance() as unknown as {
    get: (path: string, handler: (request: FastifyRequest, reply: FastifyReply) => void) => void;
  };
  const apiPrefix = `/${env.apiPrefix}/`;
  fastify.get('/*', (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url === `/${env.apiPrefix}` || request.url.startsWith(apiPrefix) || !options.serveSpa) {
      void reply.code(404).send({
        code: 'route.notFound',
        message: `没有这个地址：${request.method} ${request.url}`,
      });
      return;
    }
    // SPA 回退：前端路由由浏览器端接管
    void reply.type('text/html').sendFile('index.html');
  });
}

/** 供测试断言用：SPA 是否真的挂着 */
export function webRoot(): string {
  return env.webDir;
}

/** Nest 的类型体操用不上，但导出这个类型能让调用方少写一次 cast */
export type SpaApp = INestApplication;
