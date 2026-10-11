import { env } from '../utils/env';

/**
 * 请求体上限：旧实现靠 Fastify 的 `bodyLimit`，Nitro 默认上限是 1MB。
 * 收集器的上报体很小（几十个字段），把上限收到 64KB 是顺手的一道防滥用。
 *
 * 这里只比 content-length，不去读流：读流等于把大包先收进内存再拒绝，正是要避免的事。
 * 用 `return 响应体` 而不是 throw —— throw 会走 Nitro 的默认错误处理，吐出来的
 * 就不是我们的错误信封（statusCode/code/message）了。
 */
export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/')) return;

  const raw = getRequestHeader(event, 'content-length');
  if (!raw) return;
  const length = Number.parseInt(raw, 10);
  if (!Number.isFinite(length) || length <= env.maxBodySize) return;

  setResponseStatus(event, 413);
  return {
    statusCode: 413,
    code: 'payload.tooLarge',
    message: `请求体超过上限（${env.maxBodySize} 字节）`,
  };
});
