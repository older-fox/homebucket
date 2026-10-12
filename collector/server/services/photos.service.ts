import { env } from '../utils/env';
import { scanImageMetadata } from '../utils/exif';
import { badRequest } from '../utils/http';
import { photosRepo } from './repositories';
import {
  detectPhotoType,
  hashOfPhoto,
  photoStorage,
  storageKeyOf,
  type PhotoStorage,
  type StoredPhoto,
} from '../storage';

/**
 * 照片服务：内容寻址存储 + 去重 + 元数据入账。
 *
 * ── 为什么按内容哈希存，而不是每条目一个目录 ──
 * 电商标品图重复率很高：同一个条码的照片，几个实例都会传一遍。
 * 按内容哈希存，第二台实例上传时只是"命中已有哈希"，磁盘零增长，
 * 也天然得到"同一张图只有一个 URL"，下游缓存不会因为 URL 变化而失效。
 * 代价是删除要引用计数 —— 但本收集器不做用户主动删图
 * （删条目走管理员纠错），所以不需要引用计数，只提供 `pruneMissing` 清理孤儿。
 */
export class PhotosService {
  /** 上传：校验文件头与体积 → 计算哈希 → 已存在则直接复用 → 否则落盘并记账 */
  async upload(input: {
    bytes: Buffer;
    declaredMime: string | null;
    filename: string | null;
    instanceId: number | null;
  }): Promise<{ url: string; hash: string; bytes: number; contentType: string; deduped: boolean; storageKey: string }> {
    const { bytes } = input;
    if (bytes.length === 0) {
      throw badRequest('photo.empty', '上传内容为空');
    }
    if (bytes.length > env.photo.maxBytes) {
      throw badRequest(
        'photo.tooLarge',
        `图片超过大小上限（${env.photo.maxBytes} 字节）`,
      );
    }

    // 只信文件头：声明的 Content-Type 与文件名都是客户端可随意伪造的
    const type = detectPhotoType(bytes.subarray(0, 16));
    if (type === null) {
      throw badRequest(
        'photo.unsupportedType',
        '只接受 PNG / JPEG / WebP / GIF 图片（按文件内容识别）',
      );
    }

    /*
     * 拒收仍带元数据的图片：上报端应当已经剥过 EXIF/GPS/相机参数，
     * 这里还扫得到，就说明那边的剥离没生效 —— 与其存下来，不如明确拒绝，
     * 让"谁在上传未脱敏照片"变成一个能在日志里看见的事实。
     */
    if (env.photo.rejectExif) {
      const scan = scanImageMetadata(bytes);
      if (scan.present) {
        throw badRequest(
          'photo.metadataForbidden',
          `图片仍包含元数据（${scan.segments.join('、')}）：请先剥离 EXIF/GPS/相机参数再上传`,
        );
      }
    }

    const hash = hashOfPhoto(bytes);
    const storageKey = storageKeyOf(hash, type.ext);
    const existing = await photosRepo().findOne({ where: { hash } });
    if (existing) {
      // 已存过同一份内容：不重复写盘，但把"谁传过"补记到有实例归属的记录上，
      // 便于日后判断某张图是不是可疑来源上传的
      if (existing.instanceId === null && input.instanceId !== null) {
        existing.instanceId = input.instanceId;
        await photosRepo().save(existing);
      }
      const storage = photoStorage();
      return {
        url: storage.urlFor(existing.storageKey),
        hash,
        bytes: Number(existing.bytes),
        contentType: existing.mime,
        deduped: true,
        storageKey: existing.storageKey,
      };
    }

    const count = await photosRepo().count();
    if (count >= env.photo.maxFiles) {
      throw badRequest('photo.quotaExceeded', `照片数量已达上限（${env.photo.maxFiles}）`);
    }

    const storage = photoStorage();
    await storage.put({ hash, ext: type.ext, mime: type.mime, bytes, storageKey });
    await photosRepo().save({
      hash,
      driver: storage.driver,
      storageKey,
      mime: type.mime,
      ext: type.ext,
      bytes: bytes.length,
      width: null,
      height: null,
      instanceId: input.instanceId,
    });

    return {
      url: storage.urlFor(storageKey),
      hash,
      bytes: bytes.length,
      contentType: type.mime,
      deduped: false,
      storageKey,
    };
  }

  /**
   * 抓取外链图片并转存。
   *
   * 为什么值得做：实例上报的常是电商页面外链，那些地址随时会 404 或被防盗链挡掉，
   * 收集器的"公共资料"就会慢慢烂掉。转存一次，之后一直可用。
   *
   * 失败**不抛错而是返回原因**：外链抓取失败是完全正常的（人家站点挂了、防盗链），
   * 不该让整条上报失败 —— 上报的文字信息仍然有价值，图片保留原外链即可。
   */
  async importFromUrl(input: {
    url: string;
    instanceId: number | null;
  }): Promise<{ ok: true; url: string; hash: string; bytes: number; deduped: boolean } | { ok: false; reason: string }> {
    let parsed: URL;
    try {
      parsed = new URL(input.url);
    } catch {
      return { ok: false, reason: 'invalid_url' };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, reason: 'invalid_scheme' };
    }
    // 已经是本站照片地址，不必再抓一遍（否则会自己请求自己）
    if (parsed.pathname.startsWith('/api/photos/') && parsed.host === '') {
      return { ok: false, reason: 'already_local' };
    }

    try {
      const response = await fetch(parsed, {
        signal: AbortSignal.timeout(env.sync.timeoutMs),
        redirect: 'follow',
        headers: { accept: 'image/*' },
      });
      if (!response.ok) return { ok: false, reason: `http_${response.status}` };
      const declared = Number(response.headers.get('content-length') ?? '0');
      if (declared > env.photo.maxBytes) return { ok: false, reason: 'too_large' };
      const bytes = Buffer.from(await response.arrayBuffer());
      const result = await this.upload({
        bytes,
        declaredMime: response.headers.get('content-type'),
        filename: parsed.pathname,
        instanceId: input.instanceId,
      });
      return { ok: true, url: result.url, hash: result.hash, bytes: result.bytes, deduped: result.deduped };
    } catch (error) {
      return { ok: false, reason: `fetch_failed:${(error as Error).message.slice(0, 80)}` };
    }
  }

  /** 读取照片内容（供 `/api/photos/[...path]` 出图） */
  async read(storageKey: string): Promise<{ bytes: Buffer; mime: string } | null> {
    const row = await photosRepo().findOne({ where: { storageKey } });
    // 库里没有这一行就直接 404：不拿磁盘路径去试探未知键
    if (!row) return null;
    const storage: PhotoStorage = photoStorage();
    const bytes = await storage.get(row.storageKey);
    if (bytes === null) return null;
    return { bytes, mime: row.mime };
  }

  /** 某哈希的照片（上游同步要按条目取图上传） */
  async byHash(hash: string) {
    return photosRepo().findOne({ where: { hash } });
  }

  /** 统计：驱动、数量、总字节（面板展示用） */
  async summary(): Promise<{ driver: string; files: number; bytes: number; maxBytes: number; maxFiles: number }> {
    const rows = await photosRepo().createQueryBuilder('p').select('COUNT(1)', 'files').addSelect('COALESCE(SUM(p.bytes),0)', 'bytes').getRawOne<{ files: string; bytes: string }>();
    return {
      driver: photoStorage().driver,
      files: Number(rows?.files ?? 0),
      bytes: Number(rows?.bytes ?? 0),
      maxBytes: env.photo.maxBytes,
      maxFiles: env.photo.maxFiles,
    };
  }
}

/** 从本站照片地址里取出 storageKey（上游同步与转存时用来判断"这张图是不是已经在我们这儿"） */
export function storageKeyFromPhotoUrl(url: string): string | null {
  const marker = '/api/photos/';
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const key = url.slice(index + marker.length).split('?')[0] ?? '';
  if (key === '' || key.includes('..')) return null;
  return key;
}

/** 展开存储元数据（路由返回用） */
export function toPhotoMeta(photo: StoredPhoto): { url: string; hash: string; bytes: number; contentType: string } {
  return {
    url: photoStorage().urlFor(photo.storageKey),
    hash: photo.hash,
    bytes: photo.bytes,
    contentType: photo.mime,
  };
}
