import { createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Not, Repository } from 'typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { Attachment } from '../entities/attachment.entity';
import { Item } from '../entities/item.entity';
import { alive } from '../common/soft-delete';
import { env } from '../config/env';
import { CollectorClient } from './collector-client';
import { CollectorStateService } from './collector-state.service';
import { stripImageMetadata } from './image-strip';
import { UploadsService } from '../uploads/uploads.service';

/** 注册到 SchedulerRegistry 的任务名（排障时按名字找） */
export const COLLECTION_SYNC_JOB = 'collection-sync';

/** 每批从库里取多少个物品；**不是**一轮上报多少个（没变化的物品不消耗额度） */
const BATCH_SIZE = 50;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 定时把"所有带条码的物品"上报给收集器（含照片，照片先剥离元数据）。
 *
 * ── 为什么这里可以是定时任务，而通知那边不行 ──
 * 项目原本的取向是"不加定时任务"（见 notifications.service 的注释）：怕的是
 * 多实例/重跑导致重复推送。而这条链路是**幂等**的：
 *   · 收集器按"实例 + 内容指纹"去重，同样的数据再发一次不会多出一条流水；
 *   · 本地每个物品留了 `collectorFingerprint` 与 `collectorSyncedAt`，
 *     没变化就根本不发请求。
 * 所以重跑一轮、或多个 HomeBucket 实例同时跑，结果都收敛到同一份数据。
 *
 * ── 不按 familyId 过滤 ──
 * 收集器是**所有实例共享**的公共库，报的是"这个条码对应的商品是什么"，
 * 与"谁家有一件"无关。数量、价格、位置、序列号一律不发送。
 */
@Injectable()
export class CollectionSyncService implements OnModuleInit {
  private readonly logger = new Logger(CollectionSyncService.name);
  /** 上一轮还没跑完就别再启动一轮（cron 触发与手动触发可能撞上） */
  private running = false;

  constructor(
    private readonly registry: SchedulerRegistry,
    @InjectRepository(Item) private readonly items: Repository<Item>,
    private readonly state: CollectorStateService,
    private readonly client: CollectorClient,
    private readonly uploads: UploadsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!env.dataCollectionEnabled || !env.dataCollectionEndpoint) return;
    if (!env.dataCollectionSyncEnabled) return;

    /*
     * 用 SchedulerRegistry 动态注册，而不是 `@Cron(env.dataCollectionSyncCron)`：
     * 装饰器参数在**类定义时**求值，也就是模块 import 的时候 —— 而 dotenv 的
     * loadEnv() 排在那之后（env.ts 全用惰性 getter 正是为了绕开这一点）。
     * 写成装饰器会读到 undefined。
     */
    try {
      const job = new CronJob(env.dataCollectionSyncCron, () => void this.tick());
      this.registry.addCronJob(COLLECTION_SYNC_JOB, job);
      job.start();
      this.logger.log(`条码收集定时上报已注册（${env.dataCollectionSyncCron}）`);
    } catch (error) {
      // 表达式写错不能让应用起不来：收集上报是旁路功能
      this.logger.error(
        `定时上报的 cron 表达式无效（${env.dataCollectionSyncCron}）：${(error as Error).message}`,
      );
    }
  }

  /** 跑一轮（幂等，可重复调用） */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } finally {
      this.running = false;
    }
  }

  private async runOnce(): Promise<void> {
    const key = await this.ensureKey();
    if (!key) return;

    let scanned = 0;
    let reported = 0;
    let skipped = 0;
    let photos = 0;
    let failures = 0;
    let lastId = 0;
    let aborted: string | null = null;

    while (reported < env.dataCollectionSyncMaxItems && aborted === null) {
      const batch = await this.items.find({
        where: { ...alive(), barcode: Not(IsNull()), id: MoreThan(lastId) },
        relations: { coverImage: true, images: true },
        order: { id: 'ASC' },
        take: BATCH_SIZE,
      });
      if (batch.length === 0) break;
      lastId = batch[batch.length - 1]!.id;

      for (const item of batch) {
        scanned += 1;
        const fingerprint = fingerprintOf(item);
        // 内容与上次上报一致：不发请求，也不占收集器的限流预算
        if (item.collectorFingerprint === fingerprint) {
          skipped += 1;
          continue;
        }

        const outcome = await this.reportOne(key, item, fingerprint);
        if (outcome.abort) {
          aborted = outcome.abort;
          break;
        }
        if (outcome.failed) {
          failures += 1;
          if (failures >= env.dataCollectionSyncMaxFailures) {
            aborted = `连续失败 ${failures} 次`;
            break;
          }
          continue;
        }
        reported += 1;
        photos += outcome.photos;

        await sleep(env.dataCollectionSyncThrottleMs);
      }
    }

    if (aborted) {
      this.logger.warn(`定时上报中止（${aborted}）：已上报 ${reported}，失败 ${failures}`);
      await this.state.markError('aborted');
      return;
    }

    await this.state.markSync();
    this.logger.log(
      `定时上报完成：扫描 ${scanned}，上报 ${reported}，未变化跳过 ${skipped}，上传照片 ${photos}，失败 ${failures}`,
    );
  }

  /** 保证有一把可用的 key；注册失败返回 null（本轮不跑） */
  private async ensureKey(): Promise<string | null> {
    const existing = await this.state.key();
    if (existing) return existing;

    const result = await this.client.register(`homebucket@${hostname()}`);
    if (!result.ok) {
      this.logger.warn(`收集器实例注册失败（${result.error.kind}）：${result.error.message}`);
      await this.state.markError(result.error.kind);
      return null;
    }
    const { key, keyPrefix, instanceId, instanceName } = result.data;
    await this.state.saveRegistration({ key, keyPrefix, instanceId, instanceName });
    // 只打前缀：完整 key 是凭据，不该进日志
    this.logger.log(`已向收集器注册实例 ${instanceId}（${keyPrefix}…）`);
    return key;
  }

  /** 上报一个物品（文字 + 按需传图） */
  private async reportOne(
    key: string,
    item: Item,
    fingerprint: string,
  ): Promise<{ failed: boolean; photos: number; abort: string | null }> {
    const payload = {
      barcode: item.barcode as string,
      name: item.name,
      description: item.description,
      model: item.model,
      manufacturer: item.manufacturer,
      baseUnit: item.baseUnit,
    };

    const result = await this.client.contribute(key, payload);
    if (!result.ok) {
      const error = result.error;

      // 凭据失效：清掉重注册一次，然后交给下一轮（本轮不再继续，避免连环失败）
      if (error.kind === 'keyInvalid') {
        await this.state.clearKey();
        return { failed: true, photos: 0, abort: '实例凭据失效，已清除待重注册' };
      }
      // 被封禁/关注册/限流：整轮中止。封禁时**不**重注册，那等于绕过管理动作
      if (error.kind === 'blocked' || error.kind === 'registrationClosed' || error.kind === 'rateLimited') {
        this.logger.error(`收集器拒绝了上报（${error.kind}）：${error.message}`);
        await this.state.markError(error.kind);
        return { failed: true, photos: 0, abort: error.kind };
      }
      this.logger.warn(`上报失败（条码 ${item.barcode}，${error.kind}）：${error.message}`);
      return { failed: true, photos: 0, abort: null };
    }

    let uploaded = 0;
    let photosPermanentlyRejected = false;
    if (result.data.wantsPhotos) {
      const outcome = await this.uploadPhotos(key, item);
      uploaded = outcome.uploaded;
      photosPermanentlyRejected = outcome.permanentlyRejected;
    }

    await this.markItem(item.id, fingerprint, uploaded > 0 || photosPermanentlyRejected);
    return { failed: false, photos: uploaded, abort: null };
  }

  /**
   * 上传这个物品的照片（仅在收集器说"一张都没有"时调用）。
   *
   * 每张都先剥离元数据：照片的 EXIF 可能带着 GPS 与机身信息，而收集器公开承诺
   * 不收"存放位置" —— 让一张带坐标的图流出去，等于绕过了那条承诺。
   * 剥离不了的格式（GIF / HEIC / SVG）直接跳过：无法断言它干净，且收集器也会拒收。
   */
  private async uploadPhotos(
    key: string,
    item: Item,
  ): Promise<{ uploaded: number; permanentlyRejected: boolean }> {
    // 封面可能也在 images 里，按 id 去重；显式 push 到 Attachment[] 顺带收窄掉 null
    const attachments: Attachment[] = [];
    const seen = new Set<number>();
    for (const file of [item.coverImage, ...(item.images ?? [])]) {
      if (!file || seen.has(file.id)) continue;
      seen.add(file.id);
      attachments.push(file);
    }

    const urls: string[] = [];
    let permanentlyRejected = false;

    for (const file of attachments.slice(0, env.dataCollectionPhotoMaxPerItem)) {
      const source = await this.uploads.bytes(file.id);
      if (!source) continue;

      const stripped = stripImageMetadata(source.bytes);
      if (!stripped.ok) {
        this.logger.debug(`跳过附件 ${file.id}（${stripped.reason}）：无法确认已剥离元数据`);
        continue;
      }
      if (stripped.bytes.length > env.dataCollectionPhotoMaxBytes) continue;

      const result = await this.client.uploadPhoto(
        key,
        stripped.bytes,
        stripped.mime,
        `item-${item.id}-${file.id}`,
      );
      if (!result.ok) {
        // 元数据残留与请求非法对同一张图是永久失败：记一次 error，之后不再重试
        permanentlyRejected ||=
          result.error.kind === 'metadataForbidden' || result.error.kind === 'badRequest';
        this.logger.warn(`照片上传失败（附件 ${file.id}，${result.error.kind}）：${result.error.message}`);
        continue;
      }
      urls.push(result.data.url);
      await sleep(env.dataCollectionSyncThrottleMs);
    }

    if (urls.length === 0) return { uploaded: 0, permanentlyRejected };

    // imageUrls 在收集器是**累加**合并的，所以这里只发新增的几个 url 就够了
    const attached = await this.client.contribute(key, {
      barcode: item.barcode as string,
      imageUrls: urls,
    });
    if (!attached.ok) {
      this.logger.warn(`照片 URL 回写失败（条码 ${item.barcode}）：${attached.error.message}`);
      return { uploaded: 0, permanentlyRejected };
    }
    return { uploaded: urls.length, permanentlyRejected };
  }

  /**
   * 记录这个物品"已经报过了"。
   *
   * 用 QueryBuilder 的 update 而不是 `repository.save()`：save 会把 @UpdateDateColumn
   * 顶成当前时间，于是按 updatedAt 排序的列表会每天被重排一次。
   */
  private async markItem(itemId: number, fingerprint: string, photosDone: boolean): Promise<void> {
    const patch: Partial<Item> = {
      collectorFingerprint: fingerprint,
      collectorSyncedAt: new Date(),
    };
    if (photosDone) patch.collectorPhotoSyncedAt = new Date();
    await this.items
      .createQueryBuilder()
      .update(Item)
      .set(patch)
      .where('id = :id', { id: itemId })
      .execute();
  }
}

/**
 * 本地指纹：只回答"我上次报完之后，这个物品的公共字段变没变"。
 *
 * 带 `v1:` 前缀 —— 哪天要增减上报字段，改前缀就能让所有旧指纹一次性失效，
 * 不用迁移、也不会出现"因为少算一个字段而永久跳过上报"。
 *
 * 刻意**不复制**收集器的 contentHash：那会耦合对方的字段截断规则与 JSON 键顺序，
 * 对方改一次我们就会集体误判。真正的去重权威在收集器那边（它按实例 + 内容指纹判重），
 * 本地这一份只用来省掉无谓的请求。
 */
function fingerprintOf(item: Item): string {
  // category 这一位留空：HomeBucket 的 Item 没有 category 列（分类走标签/模板）
  const parts = [item.barcode, item.name, item.manufacturer, item.model, null, item.baseUnit];
  const joined = parts.map((value) => (value ?? '').trim()).join('');
  return `v1:${createHash('sha256').update(joined).digest('hex')}`;
}
