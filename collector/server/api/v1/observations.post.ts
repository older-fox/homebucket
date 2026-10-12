import { apiHandler, readJsonBody } from '../../utils/http';
import { sourceHintsFrom } from '../../utils/source';
import { parseObservationCompat } from '../../dto/compat';
import { CompatService } from '../../services/compat.service';

/**
 * `POST /api/v1/observations` —— **老契约**的匿名上报，固定 200（不是 201）。
 *
 * 老客户端把非 2xx 当失败重试，所以即便"新建了物品"也返回 200；
 * 匿名（instanceId=null、source='api'）的取舍与兜底手段见 services/compat.service.ts。
 *
 * ── 这条路径上的"匿名"到底指什么 ──
 * 指**没有实例凭据**（不必登录、不必注册），而不等于"收集器不知道是谁在报"：
 * 投票身份由 `utils/source.ts` 从请求本身推导（自报 `sourceId` → IP+UA 指纹）。
 * 所以老客户端的上报**照样能投票**，只是在客户端换 IP / 换版本时会掉出原来的来源，
 * 这种情况在管理端「来源」页可以看到（一个物品的投票来源里会出现 `f:` 前缀的条目）。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    const body = await readJsonBody<Record<string, unknown>>(event);
    const dto = parseObservationCompat(body);
    return new CompatService().observe(dto, sourceHintsFrom(event, body));
  }),
);
