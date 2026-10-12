import type { DataSource, EntityManager } from 'typeorm';
import { getDataSource } from '../database/db';
import type { CatalogItemRow } from '../database/entities';
import {
  BARCODE_PATTERN,
  contentHashOf,
  emptyFields,
  identityKeyOf,
  mergeItemFields,
  normalizeBarcode,
  normalizeFields,
  type ItemFields,
} from '../utils/identity';
import { parseJson, stringifyJson } from '../utils/json';
import { badRequest } from '../utils/http';
import { env } from '../utils/env';
import { clampObservedAt, normalizeObservedAt } from '../utils/time';
import { resolveSourceIdentity, type SourceHints, type SourceIdentity } from '../utils/source';
import { ItemsService } from './items.service';
import { ObservationsService } from './observations.service';
import { contributionsRepo, instancesRepo, itemsRepo, weightsRepo } from './repositories';

export interface CreateContributionDto {
  barcode?: string;
  name?: string;
  description?: string;
  model?: string;
  manufacturer?: string;
  category?: string;
  baseUnit?: string;
  imageUrls?: string[];
  attributes?: Record<string, string>;
  observedAt?: string;
}

/** 上报的落库结果；HTTP 层拿 itemId 再取一次详情视图返回 */
export interface ContributeOutcome {
  itemId: number;
  created: boolean;
  applied: string[];
  contributionId: number;
}

/**
 * 上报的写侧：把实例观测到的字段合并进物品，并留下可追溯的 Contribution。
 *
 * 写侧只做两件事：决定「这条上报要写哪些字段」和「它落在哪个物品上」，
 * 真正的取值由 ItemsService.recomputeItem 重放决定 —— 写入时顺手算出的
 * state 只是给建档/就地更新用的，字段级冲突规则只有 mergeItemFields 一份实现。
 */
export class ContributionsService {
  private readonly items: ItemsService;
  private readonly observations = new ObservationsService();

  constructor(private readonly source: DataSource = getDataSource()) {
    this.items = new ItemsService();
  }

  /**
   * 记录一条观测。
   *
   * @param instanceId 提交者；兼容接口 `/observations` 传 null（老客户端没有凭据）
   * @param hints 请求特征（IP/UA/自报 ID）：推导**投票身份**用，见 utils/source.ts。
   *   不传时退化成 `{ key: null }`（只入审计、不投票），旧调用点因此保持可用。
   */
  async create(
    instanceId: number | null,
    dto: CreateContributionDto,
    hints: SourceHints = {},
  ): Promise<ContributeOutcome> {
    const source = resolveSourceIdentity(hints);
    const fields = normalizeFields(dto as ItemFields);
    const barcode = normalizeBarcode(dto.barcode);

    // 条码格式在**服务层**校验而不是 DTO：兼容接口与实例接口共用这一条规则，
    // 放在 DTO 里就得写两份，而且归一化（去空格/连字符、转大写）之后才谈得上格式。
    if (barcode && !BARCODE_PATTERN.test(barcode)) {
      throw badRequest(
        'contribution.barcodeInvalid',
        `条码格式不合法：${barcode}（只允许字母数字与 . _ -，长度 4-64）`,
        [{ field: 'barcode', message: '条码格式不合法' }],
      );
    }

    const identityKey = identityKeyOf(barcode, fields);
    if (!identityKey) {
      throw badRequest(
        'contribution.identityMissing',
        '既没有条码、也没有足够的名称/型号/厂商信息，无法确定这是哪个物品',
        [{ field: 'barcode', message: '缺少可用于识别物品的信息' }],
      );
    }

    // 未来时间夹回现在：实例时钟不可信，否则一条"2099 年"的上报会永远压住后续观测
    const observedAt = clampObservedAt(normalizeObservedAt(dto.observedAt));

    // 唯一索引冲突重试一次：两个实例同时首次上报同一个新物品时，
    // 两边都会走"建档"分支，其中一个必然撞 identityKey 唯一索引。
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.source.transaction(async (manager) =>
          this.applyContribution(manager, instanceId, source, barcode, identityKey, fields, observedAt),
        );
      } catch (error) {
        if (attempt === 0 && isUniqueViolation(error)) continue;
        throw error;
      }
    }
    throw new Error('贡献写入失败：唯一索引冲突重试后仍未成功');
  }

  private async applyContribution(
    manager: EntityManager,
    instanceId: number | null,
    source: SourceIdentity,
    barcode: string | null,
    identityKey: string,
    fields: ItemFields,
    observedAt: string,
  ): Promise<ContributeOutcome> {
    let item = await itemsRepo(manager).findOne({ where: { identityKey } });
    let created = false;
    let applied: string[];

    if (item) {
      item = await this.items.resolveMergeChain(manager, item);
      const locked = parseJson<string[]>(item.lockedFields, []);
      const fieldUpdatedAt = parseJson<Record<string, string>>(item.fieldUpdatedAt, {});
      const merged = mergeItemFields(this.items.stateOf(item), fieldUpdatedAt, fields, {
        observedAt,
        lockedFields: locked,
      });
      applied = merged.applied;
      await this.items.persistState(manager, item, merged.next, merged.fieldUpdatedAt);
    } else {
      // 建档那一次必须从"空状态"算 applied —— 若先落库再从落库后的状态重算，
      // 每个字段都会因为"值没变"被判成未改动，首次上报的 applied 会整条空掉。
      const first = await this.createItem(manager, identityKey, barcode, fields, observedAt);
      item = first.item;
      applied = first.applied;
      created = true;
    }

    const saved = await contributionsRepo(manager).save({
      catalogItemId: item.id,
      instanceId,
      barcode,
      payload: JSON.stringify(fields),
      appliedFields: JSON.stringify(applied),
      contentHash: contentHashOf(barcode, fields),
      source: 'api',
      observedAt,
      blocked: false,
    });

    // 分源暂存：这条上报的每个字段各留一行证据（与 Contribution 同一事务）。
    // 为什么必须和 Contribution 同事务：证据是投票的输入，若贡献写成功而证据写丢，
    // 这个来源的说法就永远不参与投票，且没有任何迹象能发现（它的 applied 里明明有）。
    // 反过来若证据写成功而贡献回滚，就会出现"支持某个值的票来自一条不存在的上报"。
    //
    // 认不出来源的（既无自报 ID、也拿不到 IP）同样入库：它不投票，但要让审计与详情页
    // 能看到"这个值曾被一个未识别来源报过"，也方便日后回溯是谁贡献了第一手资料。
    const weight = await this.weightOf(manager, source.key);
    await this.observations.record(manager, {
      catalogItemId: item.id,
      source,
      instanceId,
      fields,
      observedAt,
      contributionId: saved.id,
      weight,
    });

    await this.items.refreshCounters(manager, item.id);
    if (instanceId !== null) {
      await instancesRepo(manager).increment({ id: instanceId }, 'contributionCount', 1);
    }

    return {
      itemId: item.id,
      created,
      applied,
      contributionId: saved.id,
    };
  }

  /**
   * 第一次见到某个身份时建档。
   *
   * 条码直接写进 barcode 列（`barcode:<X>` 的身份键就是这样来的），
   * fingerprint 身份（无条码）则保持 barcode 为 null —— 这类物品靠名称/型号/厂商参与匹配。
   */
  private async createItem(
    manager: EntityManager,
    identityKey: string,
    barcode: string | null,
    fields: ItemFields,
    observedAt: string,
  ): Promise<{ item: CatalogItemRow; applied: string[] }> {
    const merged = mergeItemFields(emptyFields(), {}, fields, { observedAt });
    const repo = itemsRepo(manager);
    const state = merged.next;
    const created = repo.create({
      identityKey,
      barcode,
      name: state.name ?? null,
      description: state.description ?? null,
      model: state.model ?? null,
      manufacturer: state.manufacturer ?? null,
      category: state.category ?? null,
      baseUnit: state.baseUnit ?? null,
      imageUrls: stringifyJson(state.imageUrls),
      attributes: stringifyJson(state.attributes),
      fieldUpdatedAt: stringifyJson(merged.fieldUpdatedAt),
      lockedFields: null,
      contributionCount: 0,
      instanceCount: 0,
      mergedIntoId: null,
    });
    const item = await repo.save(created);
    return { item, applied: merged.applied };
  }

  /**
   * 取来源当前权重（证据行里存的是**当时**的权重快照，供审计回看）。
   *
   * 快照与实时值分离是刻意的：审计要回答"当时这条证据值多少票"，
   * 而投票必须用最新权重（否则反馈就永远影响不了下发）。
   * 没有权重行时回落初始值，而不是顺手写一行 —— 写库发生在反馈/上报路径上，
   * 查询路径保持只读，避免一次只读请求因为"缺一行"而产生写放大。
   */
  private async weightOf(manager: EntityManager, sourceKey: string | null): Promise<number> {
    if (sourceKey === null) return env.feedback.initial;
    const row = await weightsRepo(manager).findOne({ where: { sourceKey } });
    return row === null ? env.feedback.initial : Number(row.weight);
  }
}

export function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(message);
}
