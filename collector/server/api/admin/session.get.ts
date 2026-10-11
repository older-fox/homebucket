import { apiHandler } from '../../utils/http';
import { requireAdminToken } from '../../utils/auth';
import { AdminService } from '../../services/admin.service';

/** `GET /api/admin/session` —— 令牌自检，顺带告诉纠错台当前版本与注册开关 */
export default defineEventHandler(
  apiHandler(async (event) => {
    requireAdminToken(event);
    return new AdminService().session();
  }),
);
