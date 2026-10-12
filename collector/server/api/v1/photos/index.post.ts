import { apiHandler, badRequest, payloadTooLarge } from '../../../utils/http';
import { env } from '../../../utils/env';
import { instanceKeyFrom } from '../../../utils/auth';
import { InstancesService } from '../../../services/instances.service';
import { PhotosService } from '../../../services/photos.service';

/**
 * `POST /api/v1/photos` —— 实例上传商品照片（multipart/form-data，字段名 `file`），201。
 *
 * ── 为什么用 multipart 而不是 base64 JSON ──
 * base64 会先把图片撑大 33%，还得整个塞进请求体上限（64KB）里 —— 8MB 的图直接没戏。
 * multipart 让照片走上传通道，文字信息仍走 JSON 上报，两件事互不牵连。
 *
 * ── 鉴权策略 ──
 * 带实例 key 的上传可以匿名，也允许完全匿名（`COLLECTOR_PHOTO_ALLOW_ANONYMOUS=false` 可关掉）。
 * 允许匿名是因为**老契约的上报本身就是匿名的**：若照片必须带 key，那些还在用老客户端
 * 的实例永远发不出图，而它们恰恰是最需要补图的一批。防滥用交给 IP 限流 + 文件头校验 + 配额。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    const maxBytes = env.photo.maxBytes;
    // 先看 content-length：能提前拒绝就别把大包读进内存。
    // 多留 1KB 余量给 multipart 的边界与头部（照片本身的上限由 PhotosService 再校一次）
    const declared = Number.parseInt(getRequestHeader(event, 'content-length') ?? '0', 10);
    if (Number.isFinite(declared) && declared > maxBytes + 1024) {
      throw payloadTooLarge('photo.tooLarge', `图片超过大小上限（${maxBytes} 字节）`);
    }

    const key = instanceKeyFrom(event);
    let instanceId: number | null = null;
    if (key) {
      const identity = await new InstancesService().authenticate(key);
      if (!identity) throw badRequest('instance.keyInvalid', '实例凭据无效，请重新注册');
      instanceId = identity.id;
    } else if (!env.photo.allowAnonymousUpload) {
      throw badRequest('photo.anonymousDisabled', '本站不允许匿名上传照片，请携带实例凭据');
    }

    const form = await readMultipartFormData(event);
    const part = form?.find((entry) => entry.name === 'file' && entry.data !== undefined);
    if (!part) {
      throw badRequest('photo.fileMissing', '缺少文件：请用 multipart/form-data 上传字段名 file');
    }

    const photos = new PhotosService();
    const result = await photos.upload({
      bytes: part.data,
      declaredMime: part.type ?? null,
      filename: part.filename ?? null,
      instanceId,
    });

    setResponseStatus(event, 201);
    return {
      url: result.url,
      hash: result.hash,
      bytes: result.bytes,
      contentType: result.contentType,
      // deduped 告诉上传方"这张图我们已经有了一份"：不是错误，但值得知道
      deduped: result.deduped,
    };
  }),
);
