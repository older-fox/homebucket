import { apiHandler, readJsonBody } from '../../../../utils/http';
import { requireAdminToken } from '../../../../utils/auth';
import { pathInt } from '../../../../dto/validation';
import { parseBlockContribution } from '../../../../dto/admin';
import { AdminService } from '../../../../services/admin.service';

/**
 * `POST /api/admin/contributions/:id/block` —— 屏蔽/恢复单条上报（200）。
 *
 * body `{blocked: boolean, reason?}`。屏蔽后立刻重放该物品：被这条上报独占的字段会
 * 回退到"下一条还看得见的观测"，而不是留着一个已经没有来源的值。
 * 返回 `{contribution, item}`，前端据此就地刷新列表与物品。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    requireAdminToken(event);
    const id = pathInt('id', getRouterParam(event, 'id'));
    const body = await readJsonBody<Record<string, unknown>>(event);
    const dto = parseBlockContribution(body);
    return new AdminService().setContributionBlocked(id, dto);
  }),
);
