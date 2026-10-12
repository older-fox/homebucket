import { apiHandler, readJsonBody } from '../../../utils/http';
import { requireAdminSession } from '../../../services/auth.service';
import { SyncService } from '../../../services/sync.service';
import { parseRunSync } from '../../../dto/admin';

/**
 * `POST /api/admin/sync/run` —— 手动跑一轮同步（200）。
 *
 * 定时器（见 server/plugins/upstream.ts）只在配了 `COLLECTOR_SYNC_INTERVAL_MINUTES > 0`
 * 时才跑，所以手动触发是**主路径**而不是兜底：内网部署往往宁可人工在改完一批数据后
 * 点一下，也不愿意开一个会自己往外发数据的定时器。
 *
 * `force=true` 忽略"载荷没变且上次成功"的跳过判定，用于对方库被清空重建的场景。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    await requireAdminSession(event);
    const body = await readJsonBody<Record<string, unknown>>(event);
    const dto = parseRunSync(body);
    const options: { force: boolean; limit?: number } = { force: dto.force };
    if (dto.limit !== undefined) options.limit = dto.limit;
    return new SyncService().run(options);
  }),
);
