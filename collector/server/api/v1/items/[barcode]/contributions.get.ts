import { apiHandler } from '../../../../utils/http';
import { parseQueryItems } from '../../../../dto/items';
import { ItemsService } from '../../../../services/items.service';

/**
 * `GET /api/v1/items/:barcode/contributions` —— 某物品的公开上报列表。
 *
 * 只列"算数"的上报（被屏蔽的、来自被封禁实例的都不出现）；要看全量走管理端。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    const barcode = getRouterParam(event, 'barcode') ?? '';
    const paging = parseQueryItems(getQuery(event) as Record<string, unknown>);
    const service = new ItemsService();
    const item = await service.findByBarcode(barcode);
    return service.contributionsOf(item, paging);
  }),
);
