import { apiHandler, unauthorized } from '../../../utils/http';
import { instanceKeyFrom } from '../../../utils/auth';
import { InstancesService } from '../../../services/instances.service';

/**
 * `GET /api/v1/instances/me` —— 用凭据换自己的身份（不含 key）。
 *
 * 实例端启动时用它自检：key 还对不对、有没有被封禁、自己叫什么。
 * 响应里绝不能出现 key（连 keyHash 也不行）—— 明文只有注册那一刻有，之后谁都拿不到。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    const key = instanceKeyFrom(event);
    const service = new InstancesService();
    const identity = await service.authenticate(key ?? undefined);
    if (!identity) {
      if (!key) {
        throw unauthorized(
          'instance.keyMissing',
          '缺少实例凭据：请用注册时拿到的 key 发 X-Collector-Key',
        );
      }
      throw unauthorized('instance.keyInvalid', '实例凭据无效，请重新注册');
    }
    const row = await service.requireById(identity.id);
    return service.toView(row);
  }),
);
