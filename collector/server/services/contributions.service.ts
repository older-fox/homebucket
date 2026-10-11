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
import { clampObservedAt, normalizeObservedAt } from '../utils/time';
import { ItemsService } from './items.service';
import { contributionsRepo, instancesRepo, itemsRepo } from './repositories';

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

  constructor(private readonly source: DataSource = getDataSource()) {
    this.items = new ItemsService();
  }

  /**
   * 记录一条观测。
   *
   * @param instanceId 提交者；兼容接口 `/observations` 传 null（老客户端没有凭据）
   */
  async create(
    instanceId: number | null,
    dto: CreateContributionDto,
  ): Promise<ContributeOutcome> {
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
          this.applyContribution(manager, instanceId, barcode, identityKey, fields, observedAt),
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
}

export function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(message);
}
