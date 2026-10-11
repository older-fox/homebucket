/**
 * /api/** 的兜底：未匹配到任何路由时回**我们的错误信封**，而不是 Nitro 默认的
 * 错误页/HTML。旧实现是在 Fastify 的 notFoundHandler 里做同样的事
 * （见已归档的 static/spa.ts），前端与 e2e 都按 `code === 'route.notFound'` 断言。
 *
 * 放在 server/api/ 下，Nitro 会优先匹配更具体的路由，所以这个文件只会在
 * "没有别的接口能处理"时被调用；页面路由（/、/items/xxx …）不受影响。
 */
export default defineEventHandler((event) => {
  setResponseStatus(event, 404);
  return {
    statusCode: 404,
    code: 'route.notFound',
    message: `接口不存在：${event.method} ${event.path}`,
  };
});
