import { apiHandler } from '../../../utils/http';
import { parseQueryItems } from '../../../dto/items';
import { ItemsService } from '../../../services/items.service';

/**
 * `GET /api/v1/items` —— 公开搜索（只搜未被合并的条目）。
 *
 * 未收录不报错，返回空列表：搜索是"看看有没有"的动作，客户端不该为了
 * 一个空结果去区分 200 与 404（详情接口才用 404 表达"未收录"）。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    const query = parseQueryItems(getQuery(event) as Record<string, unknown>);
    return new ItemsService().search(query);
  }),
);
