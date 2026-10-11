import { apiHandler } from '../../../utils/http';
import { requireAdminToken } from '../../../utils/auth';
import { parseQueryAdminContributions } from '../../../dto/admin';
import { AdminService } from '../../../services/admin.service';

/**
 * `GET /api/admin/contributions` —— 上报审计列表（含被屏蔽的）。
 *
 * 筛选：itemId / instanceId / blocked / source。默认按 id 倒序 —— 审计看的是
 * "最近提交了什么"，而 observedAt 可以被实例伪造成过去的时间，id 才是可靠的顺序。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    requireAdminToken(event);
    const query = parseQueryAdminContributions(getQuery(event) as Record<string, unknown>);
    return new AdminService().contributions(query);
  }),
);
