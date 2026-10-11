import { apiHandler } from '../../../utils/http';
import { requireAdminSession } from '../../../services/auth.service';
import { parseQueryItems } from '../../../dto/items';
import { AdminService } from '../../../services/admin.service';

/**
 * `GET /api/admin/items` —— 纠错台的物品列表。
 *
 * 与公开搜索的差别：**包含被合并掉的条目**（带 mergedIntoId），否则管理员
 * 无法确认合并结果，也无从把合并撤销。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    await requireAdminSession(event);
    const query = parseQueryItems(getQuery(event) as Record<string, unknown>);
    return new AdminService().items(query);
  }),
);
