import { apiHandler, readJsonBody, unauthorized } from '../../../utils/http';
import { instanceKeyFrom } from '../../../utils/auth';
import { sourceHintsFrom } from '../../../utils/source';
import { parseCreateContribution } from '../../../dto/contributions';
import { InstancesService } from '../../../services/instances.service';
import { ContributionsService } from '../../../services/contributions.service';
import { ItemsService } from '../../../services/items.service';

/**
 * `POST /api/v1/contributions` —— 已注册实例的字段上报（201）。
 *
 * 与兼容接口的区别只在"有没有实例凭据"：字段合并规则、审计记录完全共用一条代码路径，
 * 否则同一个字段在两个接口上算出不同的值只是时间问题。
 *
 * 投票身份**不靠**这把 key（老客户端压根没有 key），而是由 utils/source.ts
 * 从请求推导；key 只用来回答"这条上报来自哪个已注册实例"。
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
    const result = await contributions.create(identity.id, dto, sourceHintsFrom(event, body));
    const item = await items.requireById(result.itemId);
    const detail = await items.detail(item);

    setResponseStatus(event, 201);
    return {
      created: result.created,
      applied: result.applied,
      contributionId: result.contributionId,
      // 重发同一份内容时是 true：没写新流水，contributionId 指回已有那一条。
      deduped: result.deduped,
      // 收集器还缺不缺这个物品的照片（imageCount === 0）。上报方据此决定要不要接着传图，
      // 省掉一次"先上报、再 GET 查一次有没有图"的往返。
      wantsPhotos: detail.wantsPhotos,
      item: detail,
    };
  }),
);
