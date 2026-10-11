import { apiHandler, readJsonBody, unauthorized } from '../../../utils/http';
import { instanceKeyFrom } from '../../../utils/auth';
import { parseCreateContribution } from '../../../dto/contributions';
import { InstancesService } from '../../../services/instances.service';
import { ContributionsService } from '../../../services/contributions.service';
import { ItemsService } from '../../../services/items.service';

/**
 * `POST /api/v1/contributions` —— 已注册实例的字段上报（201）。
 *
 * 与兼容接口的区别只在"有没有身份"：字段合并规则、审计记录完全共用一条代码路径，
 * 否则同一个字段在两个接口上算出不同的值只是时间问题。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    const key = instanceKeyFrom(event);
    const identity = await new InstancesService().authenticate(key ?? undefined);
    if (!identity) {
      // 401 分两种文案，是按"请求有没有带凭据"分的，不是按 key 对不对分：
      // 没带 = 不知道怎么带（keyMissing），带了但认不出 = 需要重注册（keyInvalid）。
      if (!key) {
        throw unauthorized(
          'instance.keyMissing',
          '缺少实例凭据：请用注册时拿到的 key 发 X-Collector-Key',
        );
      }
      throw unauthorized('instance.keyInvalid', '实例凭据无效，请重新注册');
    }

    const body = await readJsonBody<Record<string, unknown>>(event);
    const dto = parseCreateContribution(body);
    const contributions = new ContributionsService();
    const items = new ItemsService();
    const result = await contributions.create(identity.id, dto);
    const item = await items.requireById(result.itemId);

    setResponseStatus(event, 201);
    return {
      created: result.created,
      applied: result.applied,
      contributionId: result.contributionId,
      item: await items.detail(item),
    };
  }),
);
