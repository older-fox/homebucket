import { apiHandler } from '../../../../utils/http';
import { requireAdminSession } from '../../../../services/auth.service';
import { pathInt } from '../../../../dto/validation';
import { AdminService } from '../../../../services/admin.service';

/**
 * `POST /api/admin/items/:id/recompute` —— 重放**这一个**条目（200）。
 *
 * 早先这里是"借 :id 定位、实际重放整库"，理由是"合并/屏蔽会牵连别的物品"。
 * 但那些操作各自的接口本来就只重放**受影响**的条目（见 AdminService 的
 * setContributionBlocked / setInstanceBlocked），"重放这个条目"这个按钮
 * 却把整库扫一遍既慢又和界面上的文案对不上。现在按 id 精确重放。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    await requireAdminSession(event);
    const id = pathInt('id', getRouterParam(event, 'id'));
    return new AdminService().recomputeItem(id);
  }),
);
