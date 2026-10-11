import { apiHandler, readJsonBody } from '../../../utils/http';
import { parseRegisterInstance } from '../../../dto/instances';
import { InstancesService } from '../../../services/instances.service';

/**
 * `POST /api/v1/instances` —— 注册收集器实例（201）。
 *
 * 明文 key 只在这一次响应里出现，库里只存 sha256(key)；所以 note 必须显式提醒
 * 用户保存 —— 丢了就只能重新注册一个实例。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    const body = await readJsonBody<Record<string, unknown>>(event);
    const dto = parseRegisterInstance(body);
    const result = await new InstancesService().register(dto);
    setResponseStatus(event, 201);
    return {
      ...result,
      note: '请把 key 保存到实例配置里：这是唯一一次返回明文',
    };
  }),
);
