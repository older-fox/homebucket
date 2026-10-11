import { apiHandler } from '../../../../utils/http';
import { requireAdminToken } from '../../../../utils/auth';
import { pathInt } from '../../../../dto/validation';
import { AdminService } from '../../../../services/admin.service';

/**
 * `POST /api/admin/items/:id/recompute` —— 重放（200）。
 *
 * 迁移前就是这样：重放**永远是全库动作**，`:id` 只用来在日志里定位是谁点的按钮。
 * 之所以不实现"只重放一个物品"：屏蔽一条上报、封禁一个实例、合并两个条目都会
 * 牵连到别的物品（合并会把上报改挂到 target），只重放一个反而会留下不一致的库。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    requireAdminToken(event);
    const id = pathInt('id', getRouterParam(event, 'id'));
    const { items } = await new AdminService().recomputeAll();
    return { recomputedItems: items, requested: id, note: '重放是全库动作，:id 只用于日志定位' };
  }),
);
