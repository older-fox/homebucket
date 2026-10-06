import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type Repository } from 'typeorm';
import { Item } from '../entities/item.entity';
import { Template } from '../entities/template.entity';
import { env } from '../config/env';

/** 收集服务返回的商品信息（由独立的收集服务项目判定与聚合） */
export interface RemoteProduct {
  barcode: string;
  name?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  /** 置信度 0~1，收集服务根据样本量给出 */
  confidence?: number;
  sources?: number;
}

/** 本实例回传的观测值 */
export interface BarcodeObservation {
  barcode: string;
  name?: string;
  manufacturer?: string;
  model?: string;
  category?: string;
}

/**
 * 条码收集服务（职责：远端条码库的查询/回传，以及本家庭的条码命中查询）。
 *
 * - lookup：向收集服务查这个条码对应的商品信息，用于创建物品时快速回填
 * - submit：把本实例新填写的条码信息回传，帮助收集服务综合判定
 * 全部走配置开关；关闭 / 未配置 / 超时 / 报错 都静默降级，不影响本地流程。
 */
@Injectable()
export class CollectionService {
  private readonly logger = new Logger(CollectionService.name);

  constructor(
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(Template) private readonly templates: Repository<Template>,
  ) {}

  private get ready(): boolean {
    return env.dataCollectionEnabled && !!env.dataCollectionEndpoint;
  }

  /** 查询远端商品信息；不可用或查不到返回 null */
  async lookup(barcode: string): Promise<RemoteProduct | null> {
    if (!this.ready || !barcode) return null;

    const url = `${env.dataCollectionEndpoint}/barcodes/${encodeURIComponent(barcode)}`;
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(env.dataCollectionTimeoutMs),
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        this.logger.warn(`条码收集服务返回 ${response.status}：${url}`);
        return null;
      }
      return (await response.json()) as RemoteProduct;
    } catch (error) {
      // 未配置真实地址 / 网络不可达时走到这里，只记 debug，不打扰用户
      this.logger.debug(`条码收集服务不可用（${(error as Error).message}）`);
      return null;
    }
  }

  /** 回传观测（fire-and-forget，失败只记日志） */
  async submit(observation: BarcodeObservation): Promise<void> {
    if (!this.ready || !env.dataCollectionSubmit || !observation.barcode) return;

    const url = `${env.dataCollectionEndpoint}/observations`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...observation, clientVersion: 'homebucket/1' }),
        signal: AbortSignal.timeout(env.dataCollectionTimeoutMs),
      });
      if (!response.ok) this.logger.debug(`条码观测回传失败：HTTP ${response.status}`);
    } catch (error) {
      this.logger.debug(`条码观测回传异常（${(error as Error).message}）`);
    }
  }

  /**
   * 本实例内该条码的命中情况（用于「本地已有」提示）。
   *
   * 改造前用 Prisma 的 select 只取物品的少数字段 + 位置的 id/name；TypeORM 的
   * relations 会把整行读回来，所以这里显式映射返回值，保证响应不多吐字段
   * （见 brief 地雷 4）。查不到时返回 null，与 findFirst 一致。
   */
  async local(familyId: number, barcode: string) {
    const item = await this.items.findOne({
      where: { familyId, barcode },
      relations: { location: true },
    });
    if (!item) return null;

    return {
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      location: item.location ? { id: item.location.id, name: item.location.name } : null,
    };
  }

  /**
   * 该条码绑定的模板（命中时前端自动套用，用于「扫码快速填充模板」）。
   * 没有绑定则返回 null；这里只取 id/name 两列，用 select 即可（纯标量收窄，
   * 不涉及关系字段，不存在地雷 4 的问题）。
   */
  async template(familyId: number, barcode: string) {
    const template = await this.templates.findOne({
      where: { familyId, barcode },
      select: { id: true, name: true },
    });
    return template ? { id: template.id, name: template.name } : null;
  }
}
