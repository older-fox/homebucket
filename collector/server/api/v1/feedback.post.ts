import { apiHandler, badRequest, readJsonBody } from '../../utils/http';
import { instanceKeyFrom } from '../../utils/auth';
import { sourceHintsFrom } from '../../utils/source';
import { InstancesService } from '../../services/instances.service';
import { FeedbackService } from '../../services/observations.service';
import { ItemsService } from '../../services/items.service';

/**
 * `POST /api/v1/feedback` —— "这条资料准不准"的反馈（200）。
 *
 * ── 为什么反馈也要能匿名 ──
 * 需求的链路是"下发 → 使用者评价 → 调整权重 → 下一次下发更准"。
 * 老契约的实例没有 key，如果反馈强制带 key，主力数据源就永远拿不到反馈，
 * 整个加权机制等于空转。所以反馈与上报一样允许匿名（限流按 IP）。
 *
 * ── 一条反馈影响多大范围 ──
 * 反馈是按 **(来源, 物品, 字段)** 记账的：一个来源对一个条码的"名称"给一次评价，
 * 这一点在权重里只算一票。不允许"一次反馈把整个来源的所有字段都抬高"，
 * 也不允许同一来源重复刷同一条 —— 否则权重会变成可被单点刷出来的数字。
 *
 * ── 反馈评的是"来源"，不是"实例" ──
 * 被评价的值（`value`）来自哪个来源，就由该来源承担权重涨跌；评价方自己也按来源去重。
 * 两者都从请求推导（utils/source.ts），所以匿名客户端同样能收反馈、也同样能被加权 ——
 * 这正是老契约下唯一可行的做法：上报本身就是匿名的（见 compat.service.ts）。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    const key = instanceKeyFrom(event);
    let reporterInstanceId: number | null = null;
    if (key) {
      const identity = await new InstancesService().authenticate(key);
      if (identity) reporterInstanceId = identity.id;
      // 凭据无效不拦：反馈本身是无害的公开信号，拦掉只会少收数据；
      // 真正的防滥用是限流与"同 (实例,物品,字段) 只算一次"
    }

    const body = await readJsonBody<Record<string, unknown>>(event);
    const rawItemId = body.itemId;
    const itemId =
      typeof rawItemId === 'number'
        ? rawItemId
        : typeof rawItemId === 'string' && /^\d+$/.test(rawItemId.trim())
          ? Number.parseInt(rawItemId.trim(), 10)
          : Number.NaN;
    if (!Number.isInteger(itemId) || itemId <= 0) {
      throw badRequest('feedback.itemInvalid', 'itemId 必须是正整数');
    }
    const field = typeof body.field === 'string' ? body.field.trim() : '';
    if (field === '') throw badRequest('feedback.fieldMissing', '缺少 field 字段');

    if (typeof body.accurate !== 'boolean') {
      throw badRequest('feedback.accurateMissing', 'accurate 必须是布尔值（资料是否准确）');
    }

    const value = typeof body.value === 'string' && body.value.trim() !== '' ? body.value.trim() : null;
    const note = typeof body.note === 'string' && body.note.trim() !== '' ? body.note.trim().slice(0, 500) : null;
    const observationId =
      typeof body.observationId === 'number' && Number.isInteger(body.observationId) && body.observationId > 0
        ? body.observationId
        : null;

    // 物品必须先存在：否则会攒出一堆指向不存在条目的反馈，权重被凭空抬高
    const items = new ItemsService();
    await items.requireById(itemId);

    // 评价方与被评价方各自的身份都从请求推导：前者用于去重，后者用于加权
    const hints = sourceHintsFrom(event, body);
    const feedback = new FeedbackService();
    const result = await feedback.submit({
      itemId,
      field,
      value,
      accurate: body.accurate,
      observationId,
      sourceKey: typeof body.sourceKey === 'string' && body.sourceKey.trim() !== ''
        ? body.sourceKey.trim()
        : null,
      reporterKey: hints.reported === '' ? null : `r:${hints.reported}`,
      reporterInstanceId,
      note,
    });

    return {
      recorded: result.recorded,
      sourceKey: result.sourceKey,
      weight: result.weight,
      upvotes: result.upvotes,
      downvotes: result.downvotes,
      // 重复评价（同一来源对同一物品同一字段再次给出相同判断）会走到这里：
      // recorded=false 让界面能说"你已经评价过这条了"，而不是假装又加了一次权
      message: result.recorded ? '反馈已记录' : '你之前已经评价过这条资料，权重未重复计算',
    };
  }),
);
