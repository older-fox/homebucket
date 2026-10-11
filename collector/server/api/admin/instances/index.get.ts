import { apiHandler } from '../../../utils/http';
import { requireAdminSession } from '../../../services/auth.service';
import { parseQueryAdminInstances } from '../../../dto/admin';
import { InstancesService } from '../../../services/instances.service';

/**
 * `GET /api/admin/instances` —— 实例列表（默认按上报量倒序）。
 *
 * 直接复用 InstancesService.list：管理端与公开视图的字段完全一样，
 * 差别只在"管理端能看到被封禁的实例"—— 而 list 本来就列出全部实例（含 blocked）。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    await requireAdminSession(event);
    const query = parseQueryAdminInstances(getQuery(event) as Record<string, unknown>);
    return new InstancesService().list(query);
  }),
);
