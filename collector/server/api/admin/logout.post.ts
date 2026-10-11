import { apiHandler } from '../../utils/http';
import { clearSessionCookie, sessionTokenFrom } from '../../utils/auth';
import { AuthService } from '../../services/auth.service';

/**
 * `POST /api/admin/logout` —— 删掉服务端会话并清 cookie。
 *
 * **不需要已登录**：cookie 已经过期/被吊销时也要能"退出"，
 * 否则前端会卡在"点了退出还是登录状态"的状态里（幂等，永远 200）。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    const token = sessionTokenFrom(event);
    const revoked = token ? (await new AuthService().logout(token)).revoked : false;
    clearSessionCookie(event);
    return { ok: true, revoked };
  }),
);
