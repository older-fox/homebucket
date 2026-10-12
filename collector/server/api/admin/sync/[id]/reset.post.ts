import { apiHandler, badRequest } from '../../../../utils/http';
import { requireAdminSession } from '../../../../services/auth.service';
import { SyncService } from '../../../../services/sync.service';

/**
 * `POST /api/admin/sync/[id]/reset` —— 把某条目置回待同步（200）。
 *
 * 存在的场景很具体：条目上次发成功之后**内容没变**，但因为对方库里那条被删了
 * （或对方说"没收到"），此时"改数据触发重传"既麻烦又不该做（数据本来是对的）。
 * 重置只动账本、不碰资料，是最小动作。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    await requireAdminSession(event);
    const id = Number(getRouterParam(event, 'id'));
    if (!Number.isInteger(id) || id <= 0) {
      throw badRequest('validation.failed', '条目 id 必须是正整数', [
        { field: 'id', message: '必须是正整数' },
      ]);
    }
    const row = await new SyncService().reset(id);
    return { ok: true, row };
  }),
);
