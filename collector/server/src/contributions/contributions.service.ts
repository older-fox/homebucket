import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CatalogItem } from '../entities/catalog-item.entity';
import { Contribution } from '../entities/contribution.entity';
import {
  BARCODE_PATTERN,
  contentHashOf,
  emptyFields,
  fingerprintOf,
  identityKeyOf,
  mergeItemFields,
  normalizeBarcode,
  normalizeFields,
} from '../common/identity';
import { parseJson } from '../common/json';
import { isoNow, normalizeObservedAt } from '../common/time';
import { ItemsService, type ItemDetailView } from '../items/items.service';
import { InstancesService } from '../instances/instances.service';
import type { CreateContributionDto } from './dto';
import type { InstanceContext } from '../common/decorators';

export interface ContributeResult {
  created: boolean;
  applied: string[];
  contributionId: number;
  item: ItemDetailView;
}

/**
 * 写入侧：把一次上报合并进物品资料。
 *
 * 全部写在一个事务里（找不到就建档、合并字段、留上报记录、刷新计数）。
 * 唯一允许的并发意外是"两个实例同时首次上报同一个条码"，那会撞 identityKey 唯一索引；
 * 这里用一次重试把它变成"第二个实例正常合并进第一个刚建好的条目"。
 */
@Injectable()
export class ContributionsService {
  private readonly logger = new Logger('Contributions');

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly itemsService: ItemsService,
    private readonly instancesService: InstancesService,
  ) {}

  async contribute(instance: InstanceContext, dto: CreateContributionDto): Promise<ContributeResult> {
    const fields = normalizeFields(dto);
    const barcode = normalizeBarcode(dto.barcode);
    if (barcode && !BARCODE_PATTERN.test(barcode)) {
      throw new BadRequestException({
        code: 'contribution.barcodeInvalid',
        message: `条码格式不合法：${barcode}（只允许字母数字与 . _ -，长度 4-64）`,
      });
    }
    const identityKey = identityKeyOf(barcode, fields);
    if (!identityKey) {
      throw new BadRequestException({
        code: 'contribution.identityMissing',
        message: '既没有条码、也没有足够的名称/型号/厂商信息，无法确定这是哪个物品',
      });
    }
    const observedAt = clampObservedAt(normalizeObservedAt(dto.observedAt));

    let attempt = 0;
    for (;;) {
      try {
        const outcome = await this.dataSource.transaction(async (manager) => {
          const repo = manager.getRepository(CatalogItem);
          const found = await repo.findOneBy({ identityKey });
          // 顺着合并链走：条码可能属于一个已被并掉的条目，上报要落到最终条目上
          const item0 = found ? await this.itemsService.resolveMergeChain(manager, found) : null;
          let item = item0;
          const created = item === null;
          const contributionRepo = manager.getRepository(Contribution);
          let applied: string[] = [];

          if (!item) {
            item = repo.create({
              identityKey,
              barcode,
              name: null,
              description: null,
              model: null,
              manufacturer: null,
              category: null,
              baseUnit: null,
              imageUrls: null,
              attributes: null,
              fieldUpdatedAt: null,
              lockedFields: null,
              contributionCount: 0,
              instanceCount: 0,
              mergedIntoId: null,
            });
            item = await repo.save(item);
            const first = mergeItemFields(emptyFields(), {}, fields, { observedAt });
            applied = first.applied;
            item = await this.itemsService.persistState(manager, item, first.next, first.fieldUpdatedAt);
          } else {
            const locked = parseJson<string[]>(item.lockedFields, []);
            const merged = mergeItemFields(
              this.itemsService.stateOf(item),
              parseJson<Record<string, string>>(item.fieldUpdatedAt, {}),
              fields,
              { observedAt, lockedFields: locked },
            );
            applied = merged.applied;
            item = await this.itemsService.persistState(manager, item, merged.next, merged.fieldUpdatedAt);
          }

          const contribution = await contributionRepo.save(
            contributionRepo.create({
              catalogItemId: item.id,
              instanceId: instance.id,
              barcode,
              payload: JSON.stringify(fields),
              appliedFields: JSON.stringify(applied),
              contentHash: contentHashOf(barcode, fields),
              source: 'api',
              observedAt,
              blocked: false,
            }),
          );
          await this.itemsService.refreshCounters(manager, item.id);
          await manager
            .getRepository('CollectorInstance')
            .increment({ id: instance.id }, 'contributionCount', 1);

          return { created, applied, contributionId: contribution.id, itemId: item.id };
        });

        const item = await this.itemsService.findById(outcome.itemId);
        return {
          created: outcome.created,
          applied: outcome.applied,
          contributionId: outcome.contributionId,
          item: await this.itemsService.detail(item),
        };
      } catch (error) {
        // 极少数并发首次建档：撞唯一索引后重试一次就变成"合并"
        if (attempt === 0 && isUniqueViolation(error)) {
          attempt += 1;
          this.logger.warn(`并发首次上报同一身份键，重试一次：${identityKey}`);
          continue;
        }
        throw error;
      }
    }
  }

  /** 人工纠错也是"一条上报"，只是来源标记为 admin、没有实例 */
  async buildAdminContribution(
    itemId: number,
    fields: ReturnType<typeof normalizeFields>,
    observedAt = isoNow(),
  ): Promise<Contribution> {
    const repo = this.dataSource.getRepository(Contribution);
    return repo.create({
      catalogItemId: itemId,
      instanceId: null,
      barcode: null,
      payload: JSON.stringify(fields),
      appliedFields: JSON.stringify([]),
      contentHash: contentHashOf(null, fields),
      source: 'admin',
      observedAt,
      blocked: false,
    });
  }
}

/**
 * 未来时间一律夹回现在。
 * 合并规则是"最新观测胜出"，如果允许未来时间，一条伪造的 9999 年上报会永久锁死该字段
 * （任何真实上报都比它早），这等于给了任何注册者一个永久污染字段的手段。
 */
export function clampObservedAt(raw: string | null): string {
  const now = isoNow();
  if (!raw) return now;
  return raw > now ? now : raw;
}

function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(message);
}
