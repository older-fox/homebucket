/**
 * 附件地址拼装（改造前这段逻辑在 locations / templates / search / items 里各写了一遍，
 * 4 份实现 3 种签名，这里合并成唯一一份）。
 *
 * 两种存储模式：
 *   · s3    —— attachment.url 存完整地址，直接用
 *   · local —— url 为空，走本服务的静态目录，由前端同源代理访问 /api/media/<key>
 */

/** 本地存储模式下对外暴露的媒体路径前缀，需与 main.ts 里的 useStaticAssets 保持一致 */
export const MEDIA_URL_PREFIX = '/api/media/';

export function mediaUrl(
  attachment: { key: string; url?: string | null } | null | undefined,
): string | null {
  if (!attachment) return null;
  return attachment.url || `${MEDIA_URL_PREFIX}${attachment.key}`;
}
