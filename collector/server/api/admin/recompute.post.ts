import { apiHandler } from '../../utils/http';
import { requireAdminSession } from '../../services/auth.service';
import { AdminService } from '../../services/admin.service';

/** `POST /api/admin/recompute` —— 全库重放（200，兜底按钮） */
export default defineEventHandler(
  apiHandler(async (event) => {
    await requireAdminSession(event);
    return new AdminService().recomputeAll();
  }),
);
