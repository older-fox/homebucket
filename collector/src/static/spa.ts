import { Logger } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env';

const logger = new Logger('Static');

/**
 * 常见静态资源的 content-type。
 * 表里没有的一律 `application/octet-stream`：宁可让浏览器下载，也别喂错 MIME ——
 * 对 ES module 来说 MIME 错了是硬错误
 * （`Failed to load module script: Expected a JavaScript-or-Wasm module script ... "text/html"`）。
 */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

/** Vite 的产物目录：文件名带内容 hash，可以无脑长缓存 */
const IMMUTABLE_PREFIX = '/assets/';

/**
 * 同进程托管前端（Vue 3 + Vite 的构建产物）。
 *
 * 为什么不用两个容器/两次部署：这个服务刻意做成"一个进程、一条命令起全栈"，
 * 联调时（HomeBucket 实例向它汇报）也少一个跨域、少一个端口。
 *
 * ── 为什么自己读写静态文件、不用 @fastify/static ──
 * 插件在 `wildcard: false` 时是**启动时 glob 出文件表再注册路由**的，README 写得很直白：
 * "will not serve newly added files"。而 `wildcard: true` 会占掉 `/*` 通配路由，
 * 和下面这条 SPA 兜底路由撞车（Fastify 不允许同一路径注册两次）。
 * 我们这里只有"读文件 + 猜 MIME"两件事，自己写反而少一层黑箱：
 * 每次请求都看磁盘，`npm run build` 换掉带 hash 的文件名后**不用重启服务端**。
 *
 * 路由规则（只兜没命中 Nest 路由的 GET/HEAD）：
 * - `/api/**` 一律回 JSON 404（接口拼错时要看到 JSON，而不是一份 HTML）
 * - 磁盘上真有这个文件 → 原样返回（`/assets/**` 长缓存，其余 no-cache）
 * - 地址没有扩展名、且 index.html 存在 → 回 index.html（前端 history 路由刷新可用）
 * - 其余（带扩展名但文件不在）→ JSON 404，别拿 HTML 去糊 JS/CSS
 */
export async function registerSpa(app: NestFastifyApplication): Promise<boolean> {
  const root = resolve(env.webDir);
  const indexFile = join(root, 'index.html');
  const serveSpa = existsSync(indexFile);

  if (!serveSpa) {
    logger.warn(
      `未找到前端构建产物（${indexFile}），本次只提供 API。` +
        '开发时请用 vite dev server（npm run dev）；部署前先 npm run build。',
    );
  }

  installFallbackRoute(app, { root, indexFile, serveSpa });

  if (serveSpa) {
    logger.log(`前端静态产物已挂载：${root}`);
  }
  return serveSpa;
}

/**
 * 未命中任何路由时的处理。
 *
 * ── 为什么是"注册一条 GET 通配路由"而不是 setNotFoundHandler ──
 * Nest 的 Fastify 适配器在 app.init() 里**已经**装了自己的 notFoundHandler
 * （用于把未命中路由变成 NotFoundException），再调 setNotFoundHandler 会直接抛
 * `Not found handler already set`。所以这里注册一条 `GET /*` 兜底路由：
 * Fastify 的路由表优先匹配更具体的静态路由，未命中的 GET 才落到这里。
 * 非 GET 请求不在这里兜底，交给 Nest 的 404（同样是 JSON）。
 */
function installFallbackRoute(
  app: NestFastifyApplication,
  options: { root: string; indexFile: string; serveSpa: boolean },
): void {
  const fastify = app.getHttpAdapter().getInstance() as unknown as {
    get: (path: string, handler: (request: FastifyRequest, reply: FastifyReply) => void) => void;
  };
  const apiRoot = `/${env.apiPrefix}`;

  fastify.get('/*', (request: FastifyRequest, reply: FastifyReply) => {
    const urlPath = urlPathOf(request.url);
    if (urlPath === null || urlPath === apiRoot || urlPath.startsWith(`${apiRoot}/`)) {
      sendJsonNotFound(reply, request);
      return;
    }
    if (!options.serveSpa) {
      sendJsonNotFound(reply, request);
      return;
    }

    const file = staticFileAt(options.root, urlPath);
    if (file) {
      sendFile(reply, file, urlPath);
      return;
    }
    // 地址看起来像前端路由（没有扩展名）才给 SPA 回退；否则老实 404，
    // 免得浏览器把一份 HTML 当成 JS/CSS 去解析（MIME 不符会直接报错）
    if (!/\.[a-z0-9]+$/i.test(urlPath)) {
      sendFile(reply, options.indexFile, '/index.html');
      return;
    }
    sendJsonNotFound(reply, request);
  });
}

/** 取 URL 的路径部分并解码；解不开（坏转义）返回 null */
function urlPathOf(rawUrl: string): string | null {
  const path = rawUrl.split('?')[0].split('#')[0];
  try {
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}

/**
 * 在静态根目录里找这个文件。
 * 目录穿越防护：解析后必须仍在 root 内（`..` 会被 resolve 折叠，逃出去就拒绝），
 * 顺带拒掉 NUL 字节这种能骗过部分系统调用的输入。
 */
function staticFileAt(root: string, urlPath: string): string | null {
  if (urlPath.includes('\0')) {
    return null;
  }
  const candidate = resolve(root, `.${urlPath}`);
  if (candidate !== root && !candidate.startsWith(root + sep)) {
    return null;
  }
  const stat = statSync(candidate, { throwIfNoEntry: false });
  return stat?.isFile() ? candidate : null;
}

function sendFile(reply: FastifyReply, file: string, urlPath: string): void {
  const type = MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
  const size = statSync(file, { throwIfNoEntry: false })?.size ?? 0;
  void reply
    .code(200)
    .header('content-type', type)
    .header('content-length', String(size))
    .header(
      'cache-control',
      urlPath.startsWith(IMMUTABLE_PREFIX) ? 'public, max-age=31536000, immutable' : 'no-cache',
    )
    .send(createReadStream(file));
}

function sendJsonNotFound(reply: FastifyReply, request: FastifyRequest): void {
  void reply.code(404).send({
    code: 'route.notFound',
    message: `没有这个地址：${request.method} ${request.url}`,
  });
}
