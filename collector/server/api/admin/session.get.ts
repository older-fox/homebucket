import { apiHandler } from '../../utils/http';
import { requireAdminSession } from '../../services/auth.service';
import { AdminService } from '../../services/admin.service';

/**
 * `GET /api/admin/session` —— 前端用它判断"当前登录的是谁"。
 *
 * 未登录/会话过期时守卫会回 401（`admin.sessionMissing` / `admin.sessionExpired`），
 * 前端据此把人送回登录页；登录成功时顺带带上账号信息与版本、注册开关，
 * 省掉一次额外请求。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    const context = await requireAdminSession(event);
    return new AdminService().session(context.user);
  }),
);
