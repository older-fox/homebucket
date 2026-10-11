import { apiHandler, readJsonBody } from '../../utils/http';
import { parseObservationCompat } from '../../dto/compat';
import { CompatService } from '../../services/compat.service';

/**
 * `POST /api/v1/observations` —— **老契约**的匿名上报，固定 200（不是 201）。
 *
 * 老客户端把非 2xx 当失败重试，所以即便"新建了物品"也返回 200；
 * 匿名（instanceId=null、source='api'）的取舍与兜底手段见 services/compat.service.ts。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    const body = await readJsonBody<Record<string, unknown>>(event);
    const dto = parseObservationCompat(body);
    return new CompatService().observe(dto);
  }),
);
