import { apiHandler } from '../../utils/http';
import { requireAdminToken } from '../../utils/auth';
import { AdminService } from '../../services/admin.service';

/** `POST /api/admin/recompute` —— 全库重放（200，兜底按钮） */
export default defineEventHandler(
  apiHandler(async (event) => {
    requireAdminToken(event);
    return new AdminService().recomputeAll();
  }),
);
