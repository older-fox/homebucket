import { apiHandler } from '../../../utils/http';
import { requireAdminSession } from '../../../services/auth.service';
import { pathInt } from '../../../dto/validation';
import { AdminService } from '../../../services/admin.service';

/**
 * `GET /api/admin/items/:id` —— 纠错台详情。
 *
 * 比公开详情多两样：全量（含被屏蔽）的最近上报，以及 mergedIntoId（如果它已被并走）。
 * 这里**不**顺着合并链跳转：管理员点进 source 就是要看 source 本身。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    await requireAdminSession(event);
    const id = pathInt('id', getRouterParam(event, 'id'));
    return new AdminService().itemDetail(id);
  }),
);
