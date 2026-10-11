import { apiHandler, readJsonBody } from '../../../utils/http';
import { requireAdminSession } from '../../../services/auth.service';
import { pathInt } from '../../../dto/validation';
import { parsePatchItem } from '../../../dto/admin';
import { AdminService } from '../../../services/admin.service';

/**
 * `PATCH /api/admin/items/:id` —— 人工改字段 / 清空字段 / 锁定字段。
 *
 * 返回 `{item, applied}`：`applied` 是这次"明确写了"的字段名列表（按写入 payload 的顺序），
 * 前端据此提示"改动了哪些字段"。注意它可能与重放后真正变化的字段不完全相同 ——
 * 比如写入的值被更晚的上报盖住时，`applied` 里仍有该字段，但值不变。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    await requireAdminSession(event);
    const id = pathInt('id', getRouterParam(event, 'id'));
    const body = await readJsonBody<Record<string, unknown>>(event);
    const dto = parsePatchItem(body);
    return new AdminService().patchItem(id, dto);
  }),
);
