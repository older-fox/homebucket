import type { DataSource } from 'typeorm';
import { getDataSource } from '../database/db';
import { parseJson } from '../utils/json';
import type { ItemFields } from '../utils/identity';
import { ContributionsService, type CreateContributionDto } from './contributions.service';
import type { SourceHints } from '../utils/source';
import { ItemsService, type ItemDetailView } from './items.service';
import type { ObservationCompatDto } from '../dto/compat';

/**
 * 主仓库实例客户端认识的那几个字段（老契约的响应形状就这么多）。
 * 只有这些字段参与"赞同票"统计：收集器里的 description/图片/扩展属性老客户端看不到。
 */
const COMPARE_FIELDS = ['name', 'manufacturer', 'model', 'category'] as const;

export interface RemoteProductView {
  barcode: string | null;
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  category: string | null;
  imageUrl: string | null;
  confidence: number;
  sources: number;
  /** 契约之外的补充字段：老客户端会忽略，新前端可以直接用 */
  description: string | null;
  attributes: Record<string, string>;
  updatedAt: string;
}

export interface ObservationAccepted {
  accepted: true;
  created: boolean;
  applied: string[];
  contributionId: number;
  /** 契约之外的补充字段：纠错台靠它把匿名上报与物品关联起来 */
  item: ItemDetailView;
}

/**
 * 与主仓库既有实例客户端的互操作层。
 *
 * 为什么要有这一层：实例端的 `server/src/collection/collection.service.ts` 只会发
 * `GET {endpoint}/barcodes/:code` 和 `POST {endpoint}/observations`，**不带任何身份**，
 * 而且已经部署出去的实例不会因为我们设计了更好的协议就自动升级。
 * 所以收集器两条腿走路：
 *   - `server/services/compat.service.ts` = 老契约（无身份、字段少、永远保持向后兼容）；
 *   - `server/api/v1/**`                  = 收集器自己的 v1 协议（实例注册、审计、纠错）。
 *
 * 匿名上报的取舍：老契约没有密钥，硬要求鉴权就等于把老实例全部挡在门外。
 * 这里选择"接受匿名" —— 代价用别的手段兜住：按 IP 限流（server/middleware/20.rate-limit.ts）、
 * 每条上报都是一条可审计的 Contribution（`instanceId=null`、`source='api'`）、
 * 管理员可以屏蔽单条上报、把字段锁死（锁定后任何自动上报都改不动）。
 *
 * ── "匿名"不等于"无来源" ──
 * 投票与反馈加权需要区分"这两条上报是不是同一个来源"，而这只能从请求本身推导
 * （自报 `sourceId` → IP+UA 指纹，见 utils/source.ts）。所以老客户端不上报 `sourceId`
 * 也照样参与投票，只是客户端换 IP 或换版本时会被算成新来源。
 */
export class CompatService {
  private readonly items: ItemsService;
  private readonly contributions: ContributionsService;

  constructor(private readonly source: DataSource = getDataSource()) {
    this.items = new ItemsService();
    this.contributions = new ContributionsService(source);
  }

  /**
   * 老契约的查询：200 = 收录，404 = 未收录（实例据此决定"没查到就不自动填充"）。
   */
  async lookup(codeRaw: string): Promise<RemoteProductView> {
    const item = await this.items.findByBarcode(codeRaw);
    const detail = await this.items.detail(item);
    const contributions = await this.items.visibleContributions(item.id);

    const payloads = contributions.map((row) => parseJson<ItemFields>(row.payload, {}));
    const comparable = payloads.filter((payload) =>
      COMPARE_FIELDS.some((field) => hasValue(payload[field])),
    );
    const agreed = comparable.filter((payload) =>
      COMPARE_FIELDS.every((field) => {
        const value = payload[field];
        return !hasValue(value) || value === detail[field];
      }),
    ).length;

    return {
      // 回显请求里的写法，而不是库里的归一化条码（`BOSCH-GSB18V55` 而不是 `BOSCHGSB18V55`）。
      // 老客户端可能拿 remote.barcode 跟自己的扫码结果比对、或直接落进本地数据，
      // 回显它的输入最不容易出意外；要看规范化身份就走收集器自己的 `/api/v1/items/:barcode`。
      barcode: codeRaw,
      name: detail.name,
      manufacturer: detail.manufacturer,
      model: detail.model,
      category: detail.category,
      imageUrl: detail.imageUrls[0] ?? null,
      confidence: confidenceOf(agreed, comparable.length),
      sources: contributions.length,
      description: detail.description,
      attributes: detail.attributes,
      updatedAt: detail.updatedAt,
    };
  }

  /**
   * 老契约的上报：`instanceId=null` 的匿名 Contribution。
   * 合并规则与注册实例完全一致（字段级"最新非空胜出"），因为"谁更可信"这件事
   * 在无身份的通道上根本无法判断 —— 与其假装能判断，不如把裁决权交给管理员的人工纠错。
   */
  async observe(dto: ObservationCompatDto, hints: SourceHints = {}): Promise<ObservationAccepted> {
    const payload: CreateContributionDto = {
      barcode: dto.barcode,
      name: dto.name,
      manufacturer: dto.manufacturer,
      model: dto.model,
      category: dto.category,
    };
    const result = await this.contributions.create(null, payload, hints);
    const item = await this.items.requireById(result.itemId);
    return {
      accepted: true,
      created: result.created,
      applied: result.applied,
      contributionId: result.contributionId,
      item: await this.items.detail(item),
    };
  }
}

/**
 * 置信度 = 赞同票 / (可比票数 + 1)。
 *
 * 那个 "+1" 是拉普拉斯式的收缩：只有一条上报时给 0.5 而不是 1.0 —— 单个实例说了算不算数，
 * 收集器的全部价值就在于"多来源互相印证"，把独苗上报标成 100% 会误导使用方。
 * 随来源增多单调上升（2 票 0.67、3 票 0.75、10 票 0.91），且永远不到 1。
 */
export function confidenceOf(agreed: number, comparable: number): number {
  if (comparable <= 0) return 0;
  return Math.round((agreed / (comparable + 1)) * 100) / 100;
}

function hasValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}
