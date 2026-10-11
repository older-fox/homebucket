import { apiHandler, readJsonBody } from '../../../../utils/http';
import { requireAdminSession } from '../../../../services/auth.service';
import { pathInt } from '../../../../dto/validation';
import { parseBlockInstance } from '../../../../dto/admin';
import { AdminService } from '../../../../services/admin.service';

/**
 * `POST /api/admin/instances/:id/block` —— 封禁/解封实例（200）。
 *
 * body `{blocked: boolean, reason?}`。封禁会让该实例**全部历史上报**一起失效，
 * 所以要把它涉及过的每个物品都重放一遍，`recomputedItems` 回报影响面。
 * 被封禁的实例之后调用 `/api/v1/instances/me` 会拿到 403 `instance.blocked`。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    await requireAdminSession(event);
    const id = pathInt('id', getRouterParam(event, 'id'));
    const body = await readJsonBody<Record<string, unknown>>(event);
    const dto = parseBlockInstance(body);
    return new AdminService().setInstanceBlocked(id, dto);
  }),
);
