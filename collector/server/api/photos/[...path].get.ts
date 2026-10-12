import { apiHandler, notFound } from '../../utils/http';
import { PhotosService } from '../../services/photos.service';

/**
 * `GET /api/photos/<...storageKey>` —— 本地驱动的出图入口。
 *
 * 为什么路径里没有 `/v1`：这个地址是**写进数据库、给浏览器直接渲染**的图片地址，
 * 不是 API 调用。`/api/photos/...` 更短、更不像版本化的接口，将来 v2 也不必跟着改。
 * S3 驱动下不会走这里（`urlFor` 直接给对象存储地址），但保留这个路由让
 * "本地存储 + 配了 CDN"的部署也能回源。
 *
 * 缓存策略：内容是**内容寻址**的（文件名就是 sha256），同一路径的内容永不变，
 * 所以可以放心 `immutable` + 一年。这也是选内容寻址的附带好处之一。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    // `/api/photos/65/6501/<hash>.png` → storageKey。用捕获组拿不到"多段路径"，
    // 所以从原始 path 里切掉前缀，而不是从 router params 里取。
    const raw = event.path.split('?')[0] ?? '';
    const marker = '/api/photos/';
    const index = raw.indexOf(marker);
    if (index === -1) throw notFound('photo.notFound', '照片不存在');
    let storageKey: string;
    try {
      storageKey = decodeURIComponent(raw.slice(index + marker.length));
    } catch {
      // 非法百分号编码（`%zz`）会让 decodeURIComponent 抛错，按"找不到"处理，
      // 否则会以 500 暴露给外面
      throw notFound('photo.notFound', '照片不存在');
    }
    // 只收本驱动写出的形状：`ab/cdef/<64 位 hex>.<ext>`。
    // 形状不对就直接 404 —— 库查询本来也会落空，但这样连查库都省了，
    // 也让"扫路径找文件"的探测请求根本无法触及存储层。
    if (!/^[0-9a-f]{2}\/[0-9a-f]{4}\/[0-9a-f]{64}\.[a-z0-9]{2,5}$/.test(storageKey)) {
      throw notFound('photo.notFound', '照片不存在');
    }

    const photo = await new PhotosService().read(storageKey);
    if (photo === null) throw notFound('photo.notFound', '照片不存在');

    setResponseHeader(event, 'content-type', photo.mime);
    setResponseHeader(event, 'content-length', photo.bytes.length);
    setResponseHeader(event, 'cache-control', 'public, max-age=31536000, immutable');
    // 图片可能来自不可信的外链抓取：禁掉嗅探与内联执行，避免把图片当 HTML/脚本解释
    setResponseHeader(event, 'x-content-type-options', 'nosniff');
    setResponseHeader(event, 'content-disposition', 'inline');
    // 匿名可读：条目本身是公开资料，图片同样公开；这里不校验实例身份，
    // 否则 `<img src>` 这种不带自定义头的请求一律取不到图
    return photo.bytes;
  }),
);
