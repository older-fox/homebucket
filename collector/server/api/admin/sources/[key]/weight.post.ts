import { apiHandler, readJsonBody } from '../../../../utils/http';
import { requireAdminSession } from '../../../../services/auth.service';
import { SourcesService } from '../../../../services/sources.service';
import { parseSourceWeight } from '../../../../dto/admin';

/**
 * `POST /api/admin/sources/:key/weight` —— 人工设定来源权重（200）。
 *
 * 救急用：自动权重要攒够反馈才动，正在刷错数据的来源需要立刻压下去。
 * 下一次有反馈进来时 `recompute` 会按反馈重算并覆盖这个值 —— 这是刻意的，
 * 反馈是事实，人工干预是临时手段。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    await requireAdminSession(event);
    const key = decodeURIComponent(getRouterParam(event, 'key') ?? '');
    const body = await readJsonBody<Record<string, unknown>>(event);
    const dto = parseSourceWeight(body);
    return new SourcesService().setWeight(key, dto.weight);
  }),
);
