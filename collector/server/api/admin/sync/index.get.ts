import { apiHandler, queryString } from '../../../utils/http';
import { requireAdminSession } from '../../../services/auth.service';
import { SyncService } from '../../../services/sync.service';
import { parseQueryAdminSync } from '../../../dto/admin';
import { env } from '../../../utils/env';

/**
 * `GET /api/admin/sync` —— 出站同步清单与配置状态（200）。
 *
 * 清单与配置一起返回，是因为页面上这两块必须同时正确：清单说"3 条失败"、
 * 配置说"transport=off"时，使用者一眼就知道失败的不是网络、而是根本没配目标。
 * 拆成两个请求反而会先渲染出一片"全部失败"再自我推翻。
 *
 * **`env.sync.token` 绝不回显**：它是对方向我方要求的凭据，回到浏览器就等于
 * 存在了前端能读的地方（会话 cookie 都特意做成 httpOnly，没道理在这里漏一个）。
 * 只回一个布尔值说明"配没配"。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    await requireAdminSession(event);
    const raw = getQuery(event) as Record<string, unknown>;
    const dto = parseQueryAdminSync({ ...raw, status: queryString(event, 'status') });
    const service = new SyncService();
    const { rows, counts } = await service.list(dto.status);

    return {
      configured: service.configured,
      config: {
        transport: env.sync.transport,
        /** http 时的目标地址；file/off 时为空串 */
        endpoint: env.sync.transport === 'http' ? env.sync.endpoint : '',
        /** file 时的落盘目录 */
        dir: env.sync.transport === 'file' ? env.sync.dir : '',
        /** 只回"有没有配令牌"，不回值本身 */
        hasToken: env.sync.token.length > 0,
        intervalMinutes: env.sync.intervalMinutes,
        batchSize: env.sync.batchSize,
        maxAttempts: env.sync.maxAttempts,
        includePhotos: env.sync.includePhotos,
      },
      counts,
      rows,
    };
  }),
);
