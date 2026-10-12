import { apiHandler, badRequest, readJsonBody } from '../../utils/http';
import { requireSyncToken } from '../../utils/sync-auth';
import { ContributionsService } from '../../services/contributions.service';
import { sourceHintsFrom } from '../../utils/source';
import type { CreateContributionDto } from '../../dto/contributions';

/**
 * `POST /api/v1/import` —— 接收对方推回来的条目（201）。
 *
 * ── 这条路径为什么必须存在 ──
 * 用户明确要求"两个方向都要"：收集器既提供只读导出给对方拉，也接受对方推回来。
 * 现实里这对应"对方做了人工清洗/合并，把最终口径回灌给收集器"。
 *
 * ── 为什么走 ContributionsService 而不是直接写 CatalogItem ──
 * 因为收集器有一条铁律：`CatalogItem` 的字段值**永远是 Contribution 重放的结果**，
 * 只有 `recomputeItem()` 一个写入点（见 items.service.ts 的说明）。回灌如果绕过
 * 重放直接改物化列，就会出现"字段与来源互相矛盾"的状态 —— 而且下一轮重放还会把它冲掉，
 * 于是变成"改完过一会儿自己变回去"这种最难查的问题。
 * 所以回灌被当成**一条来源的普通上报**：进得了投票、留得下证据、追得到来源。
 *
 * ── 来源身份 ──
 * 对方系统不是某个 homeBucket 实例，所以它自报一个来源 ID（请求体 `sourceId`，
 * 或 `x-collector-source` 头）。不报时退回 IP+UA 指纹 —— 与匿名实例上报同一套规则，
 * 于是对方在界面上就是"来源管理"里的一个来源，可以被加权、也可以被封禁。
 */
export default defineEventHandler(
  apiHandler(async (event) => {
    requireSyncToken(event);
    const body = await readJsonBody<Record<string, unknown>>(event);
    const items = Array.isArray(body.items) ? body.items : null;
    if (!items) {
      throw badRequest('validation.failed', '请求体必须包含 items 数组', [
        { field: 'items', message: '必须是数组' },
      ]);
    }
    if (items.length === 0) return { accepted: 0, created: 0, results: [] };
    if (items.length > 500) {
      // 上限存在的理由：回灌是同步动作，一次几千条会占住连接与写锁；
      // 分批推过来对双方都更好（导出接口也已经分页）。
      throw badRequest('validation.failed', '单次最多接收 500 条', [
        { field: 'items', message: '单次最多 500 条' },
      ]);
    }

    const contributions = new ContributionsService();
    const hints = sourceHintsFrom(event, body);
    const results: Array<{ barcode: string | null; created: boolean; itemId: number }> = [];
    let created = 0;
    for (const raw of items) {
      if (typeof raw !== 'object' || raw === null) {
        throw badRequest('validation.failed', 'items 里每一项都必须是对象');
      }
      const item = raw as Record<string, unknown>;
      const dto = toContribution(item);
      const outcome = await contributions.create(null, dto, hints);
      if (outcome.created) created += 1;
      results.push({
        barcode: typeof item.barcode === 'string' ? item.barcode : null,
        created: outcome.created,
        itemId: outcome.itemId,
      });
    }
    setResponseStatus(event, 201);
    return { accepted: results.length, created, results };
  }),
);

/**
 * 回灌项 → 上报 DTO。
 *
 * 只取我们**确实认识**的字段：对方可能带着它自己的内部字段（`id`、`updatedAt`、
 * 各种审计列），把它们当成上报内容塞进去只会污染资料库。未知字段静默忽略，
 * 而不是报错 —— 对方加一个自己的字段不该让整批回灌失败。
 */
function toContribution(item: Record<string, unknown>): CreateContributionDto {
  const dto: CreateContributionDto = {};
  for (const key of ['barcode', 'name', 'model', 'manufacturer', 'category', 'description'] as const) {
    const value = item[key];
    if (typeof value === 'string' && value.trim() !== '') dto[key] = value;
  }
  if (Array.isArray(item.imageUrls)) {
    const urls = item.imageUrls.filter((url): url is string => typeof url === 'string' && url.trim() !== '');
    if (urls.length > 0) dto.imageUrls = urls;
  }
  /*
   * attributes 原样透传：**不加** `attributes.` 前缀。
   *
   * 这里踩过一次坑，记下来免得再犯：`attributes.<key>` 是收集器**内部**的扁平
   * 字段表示法（用于锁定与投票，见 identity.ts / provenance.ts），而对外契约里
   * attributes 始终是「一个普通对象，键就是属性名」（见 dto/contributions.ts）。
   * `parseCreateContribution` 直接读 `raw.attributes` 交给 `parseAttributes`，
   * 前缀是它在内部自己加的。回灌时若先加一层前缀，属性名就会变成字面量
   * `attributes.电压` 落库 —— 出站又会把它当纯键、再此基础上重复一层，
   * 表现为「属性名每同步一轮就多一截前缀」，而日志里一切正常。
   */
  if (typeof item.attributes === 'object' && item.attributes !== null && !Array.isArray(item.attributes)) {
    const attributes: Record<string, string> = {};
    for (const [key, value] of Object.entries(item.attributes as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim() !== '') attributes[key] = value;
    }
    if (Object.keys(attributes).length > 0) dto.attributes = attributes;
  }
  return dto;
}
