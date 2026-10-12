import { apiHandler, badRequest, notFound } from '../../../utils/http';
import { requireAdminSession } from '../../../services/auth.service';
import { SyncService } from '../../../services/sync.service';

/**
 * `GET /api/admin/sync/[id]` —— 单个条目的同步状态 + 上行载荷预览（200）。
 *
 * 预览是这一页的核心价值：上级数据库接口还没定，对方到底收到什么、
 * 是不是"图片一个都没带上"、条码是不是原样，只有把真实载荷摆出来才能确认。
 * 预览用 `payloadOf()` 现算，而不是读库里的历史载荷 —— 库里存的是**上次发送时**的内容，
 * 而使用者点进来想问的是"**现在**再送会送什么"。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    await requireAdminSession(event);
    const raw = getRouterParam(event, 'id');
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      throw badRequest('validation.failed', '条目 id 必须是正整数', [
        { field: 'id', message: '必须是正整数' },
      ]);
    }
    const service = new SyncService();
    const { rows } = await service.list();
    const row = rows.find((item) => item.catalogItemId === id);
    if (!row) throw notFound('sync.notFound', '该条目还没有同步记录');
    const payload = await service.previewOf(id);
    return { row, payload };
  }),
);
