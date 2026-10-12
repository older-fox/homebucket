import { apiHandler, notFound } from '../../../utils/http';
import { requireSyncToken } from '../../../utils/sync-auth';
import { SyncService } from '../../../services/sync.service';

/**
 * `GET /api/v1/export/:barcode` —— 单个条码的导出（200 / 404）。
 *
 * 分页导出适合对账，但对方发起一次即时查询时（"这个条码你这边有没有"）
 * 不该逼它拉全库再自己过滤。404 用 `item.notFound` 与公开查询接口保持同一套错误码，
 * 对方处理逻辑可以复用。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    requireSyncToken(event);
    const barcode = decodeURIComponent(String(getRouterParam(event, 'barcode') ?? '')).trim();
    const service = new SyncService();
    const item = await service.exportOneByBarcode(barcode);
    if (!item) throw notFound('item.notFound', '未收录该条码');
    return service.batchPayload([item]);
  }),
);
