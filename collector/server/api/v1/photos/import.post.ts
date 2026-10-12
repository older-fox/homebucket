import { apiHandler, badRequest } from '../../../utils/http';
import { env } from '../../../utils/env';
import { instanceKeyFrom } from '../../../utils/auth';
import { InstancesService } from '../../../services/instances.service';
import { PhotosService } from '../../../services/photos.service';

/**
 * `POST /api/v1/photos/import` —— 把外链图片抓回来转存（201，返回本站地址）。
 *
 * ── 为什么需要它 ──
 * 实例上报的图多是电商页面外链，那些地址会失效、会被防盗链挡住。
 * 收集器的定位是"公共且长期可用"的资料源，图片烂掉等于资料烂掉，
 * 所以提供一个把外链"固化"成本站副本的入口。
 *
 * ── 为什么不直接在上报时自动抓 ──
 * 上报路径必须快且稳：一台实例在一个大促页面里报 20 个外链，
 * 逐个抓取会把上报请求拖到几十秒、还可能被对端限流。让调用方显式调这个接口，
 * 就能一个外链一次调用、失败只影响那一张图（返回 200 + ok:false，不是 5xx）。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    const key = instanceKeyFrom(event);
    let instanceId: number | null = null;
    if (key) {
      const identity = await new InstancesService().authenticate(key);
      if (!identity) throw badRequest('instance.keyInvalid', '实例凭据无效，请重新注册');
      instanceId = identity.id;
    } else if (!env.photo.allowAnonymousUpload) {
      throw badRequest('photo.anonymousDisabled', '本站不允许匿名转存图片，请携带实例凭据');
    }

    const body = await readBody<Record<string, unknown>>(event);
    const url = typeof body?.url === 'string' ? body.url.trim() : '';
    if (url === '') throw badRequest('photo.urlMissing', '缺少 url 字段');

    const photos = new PhotosService();
    const result = await photos.importFromUrl({ url, instanceId });
    if (!result.ok) {
      // 抓取失败是**预期内**的正常结局（对端 404 / 防盗链 / 超时），
      // 所以回 200 + ok:false + 原因，而不是 4xx/5xx：调用方据此决定是否保留原外链
      setResponseStatus(event, 200);
      return { ok: false, url, reason: result.reason };
    }

    setResponseStatus(event, 201);
    return {
      ok: true,
      url: result.url,
      hash: result.hash,
      bytes: result.bytes,
      deduped: result.deduped,
      sourceUrl: url,
    };
  }),
);
