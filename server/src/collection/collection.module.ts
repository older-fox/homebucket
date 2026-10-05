import { Controller, Get, Injectable, Logger, Module, Param } from '@nestjs/common';
import { CurrentFamily, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import { PrismaService } from '../prisma/prisma.service';
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
 * 条码数据收集客户端：
 * - lookup：向收集服务查这个条码对应的商品信息，用于创建物品时快速回填
 * - submit：把本实例新填写的条码信息回传，帮助收集服务综合判定
 * 全部走配置开关；关闭 / 未配置 / 超时 / 报错 都静默降级，不影响本地流程。
 */
@Injectable()
export class CollectionService {
  private readonly logger = new Logger(CollectionService.name);

  constructor(private readonly prisma: PrismaService) {}

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

  /** 本实例内该条码的命中情况（用于「本地已有」提示） */
  async local(familyId: number, barcode: string) {
    return this.prisma.item.findFirst({
      where: { familyId, barcode },
      select: {
        id: true,
        name: true,
        quantity: true,
        location: { select: { id: true, name: true } },
      },
    });
  }
}

@Controller('barcodes')
export class CollectionController {
  constructor(
    private readonly collection: CollectionService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 条码查询：先看本家庭是否已有该条码的物品，再向收集服务要一份"商品真实信息"。
   * 前端据此决定是「直接打开已有物品」还是「用远端信息预填新建表单」。
   */
  @FamilyScoped()
  @Get(':code/lookup')
  async lookup(@CurrentFamily() family: FamilyContext, @Param('code') code: string) {
    const barcode = code.trim();
    const local = await this.collection.local(family.id, barcode);
    const remote = await this.collection.lookup(barcode);

    return {
      barcode,
      local,
      remote,
      /** 收集功能是否可用（前端可据此提示"条码库未启用"） */
      collectionEnabled: env.dataCollectionEnabled,
      collectionAvailable: !!env.dataCollectionEndpoint && !!remote,
    };
  }
}

@Module({
  controllers: [CollectionController],
  providers: [CollectionService],
  exports: [CollectionService],
})
export class CollectionModule {}
