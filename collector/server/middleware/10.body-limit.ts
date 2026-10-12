import { env } from '../utils/env';

/**
 * 请求体上限：旧实现靠 Fastify 的 `bodyLimit`，Nitro 默认上限是 1MB。
 * 收集器的上报体很小（几十个字段），把上限收到 64KB 是顺手的一道防滥用。
 *
 * **照片是唯一的例外**：`/api/v1/photos` 收的是图片，默认上限是 8MB
 * （`env.photo.maxBytes`）。64KB 那道闸对所有 `/api/**` 生效，而照片路由自己的
 * 检查在它**之后** —— 于是任何一张真实照片都会先被这里用 413 挡掉，接口等于没开。
 * 所以按路径分别取上限，而不是把全局上限抬到 8MB（那等于放弃对上报体的保护）。
 *
 * 这里只比 content-length，不去读流：读流等于把大包先收进内存再拒绝，正是要避免的事。
 * 用 `return 响应体` 而不是 throw —— throw 会走 Nitro 的默认错误处理，吐出来的
 * 就不是我们的错误信封（statusCode/code/message）了。
 *
 * ⚠️ 已知缺口：chunked 上传没有 content-length，这里拦不住，只能由照片路由在
 * `readMultipartFormData` 之后按实际字节数兜底（见 api/v1/photos/index.post.ts）。
 */

/** multipart 的边界与各 part 头部开销；给足余量，别让"刚好等于上限的图"被边界挤掉 */
const MULTIPART_SLACK = 64 * 1024;

function limitFor(path: string): number {
  if (path.startsWith('/api/v1/photos')) return env.photo.maxBytes + MULTIPART_SLACK;
  return env.maxBodySize;
}

export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/')) return;

  const raw = getRequestHeader(event, 'content-length');
  if (!raw) return;
  const length = Number.parseInt(raw, 10);
  const limit = limitFor(event.path);
  if (!Number.isFinite(length) || length <= limit) return;

  setResponseStatus(event, 413);
  return {
    statusCode: 413,
    code: 'payload.tooLarge',
    message: `请求体超过上限（${limit} 字节）`,
  };
});
