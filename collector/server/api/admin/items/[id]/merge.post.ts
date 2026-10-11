import { apiHandler, readJsonBody } from '../../../../utils/http';
import { requireAdminSession } from '../../../../services/auth.service';
import { pathInt } from '../../../../dto/validation';
import { parseMergeItem } from '../../../../dto/admin';
import { AdminService } from '../../../../services/admin.service';

/**
 * `POST /api/admin/items/:id/merge` —— 把 body.sourceItemId 合并进 :id（200）。
 *
 * 合并后 source 上报全部改挂到 target、source.mergedIntoId 指向 target；
 * 旧条码查询会顺着链跳到 target，所以合并不会让已扫过的条码失效。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    await requireAdminSession(event);
    const id = pathInt('id', getRouterParam(event, 'id'));
    const body = await readJsonBody<Record<string, unknown>>(event);
    const dto = parseMergeItem(body);
    return new AdminService().mergeItems(id, dto.sourceItemId);
  }),
);
