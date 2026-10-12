import { apiHandler, queryString } from '../../utils/http';
import { requireSyncToken } from '../../utils/sync-auth';
import { SyncService } from '../../services/sync.service';
import { env } from '../../utils/env';
import { badRequest } from '../../utils/http';

/**
 * `GET /api/v1/export?page=1&pageSize=200` —— 只读导出（200）。
 *
 * 这是"对方主动来拉"那条路径。与 POST 推送共用同一套载荷构造（`SyncService`），
 * 所以两种方向的字段口径不可能分叉 —— 这正是用户要求"两个方向都要"时
 * 最容易踩的坑：各写一套映射，最后同一个物品在两条路径上长得不一样。
 *
 * 分页是**必须**的（不是优化）：全库资料一次吐出去，大库会先把对方读超时，
 * 再把我方内存占满。响应里带上 `total`/`hasMore`，对方循环拉直到 `hasMore=false`。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    requireSyncToken(event);
    const page = readPositiveInt(event, 'page', 1, 1, 100_000);
    const requested = readPositiveInt(event, 'pageSize', env.sync.batchSize, 1, 1000);

    const service = new SyncService();
    const total = await service.exportCount();
    const skip = (page - 1) * requested;
    const items = await service.exportPage(skip, requested);

    return {
      ...service.batchPayload(items),
      page,
      pageSize: requested,
      total,
      hasMore: skip + items.length < total,
      /**
       * 导出方向不需要记账（对方来拉多少次都不该改变"我方推没推成功"的状态），
       * 所以这里不碰 OutboundSync 表 —— 那是推送方向的账本。
       */
    };
  }),
);

/** 读取正整数查询参数；越界或非法一律 400（不静默钳成边界值，否则调用方会以为按自己说的拉了） */
function readPositiveInt(
  event: Parameters<typeof queryString>[0],
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = queryString(event, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw badRequest('validation.failed', `${name} 必须是 ${min}~${max} 之间的整数`, [
      { field: name, message: `范围 ${min}~${max}` },
    ]);
  }
  return value;
}
