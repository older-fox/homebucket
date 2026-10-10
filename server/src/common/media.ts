/**
 * 附件地址拼装（改造前这段逻辑在 locations / templates / search / items 里各写了一遍，
 * 4 份实现 3 种签名，这里合并成唯一一份）。
 *
 * 两种存储模式：
 *   · s3    —— attachment.url 存完整地址，直接用
 *   · local —— url 为空，走本服务的静态目录，由前端同源代理访问 /api/media/<key>
 */

import { env } from '../config/env';

/**
 * 本地存储模式下对外暴露的媒体路径前缀。
 *
 * 从 `API_PREFIX` 推导而不是写死 `/api/media/`：原先 media.ts 与 main.ts 各写了一份字面量，
 * 把 API_PREFIX 改成别的前缀后静态目录还挂在 /api/media/，媒体 URL 会静默 404。
 * 用函数而不是常量，是因为 env 的 getter 必须惰性求值（.env 的加载晚于模块顶层执行）。
 */
export function mediaUrlPrefix(): string {
  return `/${env.apiPrefix}/media/`;
}

export function mediaUrl(
  attachment: { key: string; url?: string | null } | null | undefined,
): string | null {
  if (!attachment) return null;
  return attachment.url || `${mediaUrlPrefix()}${attachment.key}`;
}
