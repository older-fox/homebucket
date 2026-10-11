import { env } from '../utils/env';

/**
 * CORS：默认 `*`（这是公共只读资料库，浏览接口本来就该被任意站点调用）。
 * 收紧时填白名单，未命中的来源**不回** CORS 头（而不是回一个错误的头让浏览器困惑）。
 *
 * 与旧 Fastify onRequest 钩子逐字一致：同样的头名、同样的 max-age、同样在预检时 204。
 * 放在 middleware 里而不是路由里，是为了让预检请求在进入任何业务代码前就结束。
 */
function resolveCorsOrigin(origin: string): string | null {
  if (env.corsOrigin === '*') return '*';
  return env.corsOrigin.includes(origin) ? origin : null;
}

export default defineEventHandler((event) => {
  const origin = getRequestHeader(event, 'origin');
  if (!origin) return;
  const allowed = resolveCorsOrigin(origin);
  if (!allowed) return;

  setResponseHeaders(event, {
    'access-control-allow-origin': allowed,
    vary: 'origin',
    'access-control-allow-headers': 'content-type,x-collector-key',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-max-age': 600,
  });

  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204);
    return '';
  }
});
