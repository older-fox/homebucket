import { apiHandler } from '../../../utils/http';
import { ItemsService } from '../../../services/items.service';

/**
 * `GET /api/v1/items/:barcode` —— 物品详情（含字段来源）。
 *
 * 传进来的拼写会先归一化（去空格/连字符、转大写）再查；被合并过的旧条码
 * 会顺着 mergedIntoId 找到最终条目，所以合并之后老条码不会突然 404。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    const barcode = getRouterParam(event, 'barcode') ?? '';
    const service = new ItemsService();
    const item = await service.findByBarcode(barcode);
    return service.detail(item);
  }),
);
