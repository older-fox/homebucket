import { apiHandler } from '../../../utils/http';
import { requireAdminSession } from '../../../services/auth.service';
import { SourcesService } from '../../../services/sources.service';

/**
 * `GET /api/admin/sources/:key` —— 单个来源的全部痕迹（200）。
 *
 * `:key` 形如 `r:<32位十六进制>` 或 `f:<32位十六进制>`，含冒号，
 * 但冒号在路径段里合法，直接用 `getRouterParam` 取即可（不要 decode 两次）。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    await requireAdminSession(event);
    const key = getRouterParam(event, 'key') ?? '';
    return new SourcesService().detail(decodeURIComponent(key));
  }),
);
