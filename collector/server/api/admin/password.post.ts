import { apiHandler, readJsonBody } from '../../utils/http';
import { parseChangePassword } from '../../dto/auth';
import { AuthService, requireAdminSession } from '../../services/auth.service';

/**
 * `POST /api/admin/password` —— 改密码（要登录，且要带当前密码）。
 *
 * 为什么必须验证当前密码：会话 cookie 一旦被某台机器上的恶意页面/扩展偷到，
 * 攻击者就能直接改密码把真正的管理员锁在门外。要求旧密码把这一步的门槛
 * 抬回"知道口令"。
 *
 * 成功后除当前会话外的会话全部作废（改密码的动机往往就是"怀疑别人登进来了"）。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    const context = await requireAdminSession(event);
    const dto = parseChangePassword(await readJsonBody<Record<string, unknown>>(event));
    const result = await new AuthService().changePassword(
      context,
      dto.currentPassword,
      dto.newPassword,
    );
    return { ok: true, user: result.user, revokedSessions: result.revokedSessions };
  }),
);
