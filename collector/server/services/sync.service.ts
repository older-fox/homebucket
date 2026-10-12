/**
 * 出站同步（"上级数据库"适配层）。
 *
 * ── 为什么是"适配层"而不是"对接实现" ──
 * 上级数据库是另一个独立项目，**它的接口还没定**。在这种情况下写死一套
 * `POST /api/items` 之类的东西，等于替对方做主：等它真定下来，这些代码要么全删、
 * 要么被改成四不像。所以这里只固定三件**与对方协议无关**的事：
 *
 *   1. **选谁**：哪些条目该送（有 barcode 的、内容变过的、上次失败的）；
 *   2. **送什么**：载荷长什么样（收集器侧的完整事实，含图片 URL）；
 *   3. **记什么**：每个条目送成功没有、试过几次、最后错误是什么。
 *
 * 而"怎么送"收敛成一个 `SyncTransport` 接口，目前两个实现：
 *   · `file` —— 把载荷写成 JSON 文件到 COLLECTOR_SYNC_DIR。零依赖、可离线、
 *     适合"先跑起来看数据长什么样"和对方派车来取；
 *   · `http` —— 把载荷 POST 到 `COLLECTOR_SYNC_ENDPOINT`（可选 Bearer 令牌）。
 *
 * 对方接口定下来之后，新增一个 transport（或改 http 的载荷映射）就够了，
 * 3 与 1 完全不用动。
 *
 * ── 为什么载荷不内联图片字节 ──
 * 图片走绝对 URL（`includePhotos` 控制是否列出）。内联 base64 会让载荷体积 ×1.33，
 * 而且"每次全量上传所有有条码的条目"这条需求一旦图片多起来，JSON 就不适合承载了。
 * 对方能抓到这些 URL 就行；不能抓（内网隔离）时把 COLLECTOR_PHOTO_PUBLIC_BASE
 * 配成对方可达的地址即可，不需要改代码。
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EntityManager } from 'typeorm';
import { env } from '../utils/env';
import { conflict } from '../utils/http';
import { isoNow } from '../utils/time';
import { outboundSyncRepo, itemsRepo } from './repositories';
import type { CatalogItemRow, OutboundSyncRow } from '../database/entities';
import { ItemsService } from './items.service';
import type { ItemDetailView } from './items.service';

/** 同步状态：一行一物品，见 OutboundSync 实体的说明 */
export type SyncStatus = 'pending' | 'ok' | 'failed';

/** 送去上级数据库的单个条目载荷（收集器侧的事实，不做对方协议的假设） */
export interface SyncPayloadItem {
  /** 收集器内部 id：对方回报问题时用来对账 */
  id: number;
  barcode: string;
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  category: string | null;
  description: string | null;
  baseUnit: string | null;
  /** 扩展属性（键值对，键不含 `attributes.` 前缀 —— 那是我方内部表示法） */
  attributes: Record<string, string>;
  /** 图片：本站可访问的绝对/相对 URL 列表（按 `includePhotos` 决定是否带） */
  imageUrls: string[];
  /** 该条目收到过多少次上报、被多少个来源报过 —— 对方判断可信度用 */
  contributions: number;
  sources: number;
  firstSeenAt: string;
  updatedAt: string;
  /**
   * 各字段当前值的来源标签（"哪个来源报的"）。
   * 一并送出是因为对方也可能要做同样的加权判断；不给的话对方只能盲信我方结论。
   */
  provenance: Array<{ field: string; label: string | null; observedAt: string }>;
}

/** 一次同步的整批载荷 */
export interface SyncPayload {
  /** 载荷格式版本：对方按这个判解析方式，改结构时递增 */
  format: 'homebucket.collector.sync/1';
  generatedAt: string;
  /** 收集器版本与数据文件，排障时对方直接能看出是谁送的 */
  collector: { version: string; dataFile: string };
  /** 本批条目数（= items.length，为了让对方不必先解析完整个数组做校验） */
  count: number;
  items: SyncPayloadItem[];
}

/** 发送结果：成功要给出远端标识，失败要给出人话原因 */
export interface SyncSendResult {
  ok: boolean;
  /** 远端标识（对方返回的 id / 落盘文件名） */
  remoteRef?: string;
  error?: string;
}

/**
 * 传输实现。
 *
 * 刻意只收"一批载荷 + 一个批次号"，不把数据库、配置、重试策略透进来：
 * 传输只管把字节送到，重试与状态由 `SyncService` 统一记账。
 */
export interface SyncTransport {
  readonly name: string;
  send(payload: SyncPayload, batch: { index: number; total: number }): Promise<SyncSendResult>;
}

/** 落盘传输：`<dir>/<时间戳>-<批次>.json`。对方派车来取，或人工看数据长什么样 */
export class FileSyncTransport implements SyncTransport {
  readonly name = 'file';

  constructor(private readonly dir: string) {}

  async send(payload: SyncPayload): Promise<SyncSendResult> {
    try {
      await mkdir(this.dir, { recursive: true });
      // 文件名带生成时间与批次指纹：同一秒重跑不会互相覆盖，又能一眼看出先后
      const stamp = payload.generatedAt.replace(/[:.]/g, '-');
      const name = `${stamp}-${payload.items.length}.json`;
      const target = join(this.dir, name);
      await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      return { ok: true, remoteRef: name };
    } catch (error) {
      return { ok: false, error: `写入同步目录失败：${errorText(error)}` };
    }
  }
}

/**
 * HTTP 传输：`POST <endpoint>`，JSON 体，可选 `Authorization: Bearer <token>`。
 *
 * 判成功的口径是**任何 2xx**。对方接口未定，所以不假设响应体里有 id；
 * 有 `id`/`ref` 字段就记下来当远端标识，没有就留空 —— 记录里 status=ok 已经
 * 是"送成功了"的充分信息，不为一个展示字段去猜对方协议。
 */
export class HttpSyncTransport implements SyncTransport {
  readonly name = 'http';

  constructor(
    private readonly endpoint: string,
    private readonly token: string,
    private readonly timeoutMs: number,
  ) {}

  async send(payload: SyncPayload): Promise<SyncSendResult> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        // 只留前 200 字符的响应体：500 页面可能是整页 HTML，全记进去会把错误列撑爆
        const body = (await response.text().catch(() => '')).slice(0, 200);
        return { ok: false, error: `HTTP ${response.status}${body ? `：${body}` : ''}` };
      }
      const remoteRef = await readRemoteRef(response);
      return remoteRef ? { ok: true, remoteRef } : { ok: true };
    } catch (error) {
      // 超时、DNS 失败、连接被拒都落这里；区分它们对运维没用，人话写清即可
      return { ok: false, error: `请求失败：${errorText(error)}` };
    }
  }
}

/** 从响应里尽力读出远端标识；读不出（非 JSON、字段改名）就返回空串，不算失败 */
async function readRemoteRef(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (typeof data !== 'object' || data === null) return '';
    const record = data as Record<string, unknown>;
    for (const key of ['id', 'ref', 'remoteRef', 'itemId']) {
      const value = record[key];
      if (typeof value === 'string') return value.slice(0, 200);
      if (typeof value === 'number') return String(value);
    }
    return '';
  } catch {
    return '';
  }
}

/** 把任意抛出物变成一句人话（Error 取 message，其它 String()） */
function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** 建当前配置对应的传输实现；`transport=off` 返回 null（调用方据此判断"没配就不跑"） */
export function transportOf(): SyncTransport | null {
  const { transport, endpoint, token, dir, timeoutMs } = env.sync;
  if (transport === 'http') return new HttpSyncTransport(endpoint, token, timeoutMs);
  if (transport === 'file') return new FileSyncTransport(dir);
  return null;
}

/** 一个待送条目的账本状态 + 载荷 */
export interface SyncCandidate {
  row: OutboundSyncRow;
  payload: SyncPayloadItem;
  /** 载荷指纹：没变且上次成功 → 跳过，避免"每次全量重传"真的每次都传 */
  payloadHash: string;
}

export interface SyncRunResult {
  /** 扫描到的"有条码且未被合并"的条目数 */
  scanned: number;
  /** 实际发出去的条目数（跳过的与失败的都不算） */
  sent: number;
  /** 因为载荷没变且上次成功而跳过的条目数 */
  skipped: number;
  /** 失败的条目数 */
  failed: number;
  /** 配了 off 时为 false（界面显示"未配置"而不是"成功 0 条"） */
  configured: boolean;
  errors: Array<{ itemId: number; barcode: string; message: string }>;
}

/**
 * 出站同步服务。
 *
 * 状态机很小：pending →（发送）→ ok / failed。`failed` 不是终态：
 * 下次跑（手动或定时）会把它重新纳入候选，attempts 累加，超过
 * `maxAttempts` 后仍在候选里但不再自动重试 —— 见 `isDue()`。
 */
/**
 * 同一进程内只允许一轮同步在跑。
 *
 * 定时器（plugins/upstream.ts）与"立即同步"接口（api/admin/sync/run.post.ts）都会
 * `new SyncService().run()`，两边是不同实例，所以锁必须放在**模块作用域**而不是实例上。
 * 没有它时，手动触发能撞进定时器那一轮，两轮各自读到同一批 due 条目、各自标记，
 * 把 attempts / syncedAt 记成两份。
 */
let activeRun: Promise<SyncRunResult> | null = null;

export class SyncService {
  private readonly items = new ItemsService();

  /** 当前是否配好了可用的传输（界面用它显示"未配置"） */
  get configured(): boolean {
    return env.sync.transport !== 'off';
  }

  /**
   * 挑出这一轮该送的条目。
   *
   * 三个条件都必要：
   *   · **有 barcode** —— 需求原话是"拥有商品条码号的物品"，没有条码的条目在
   *     上级库里无法去重，送过去只会造一堆重复；无条码条目要等人工在纠错台补条码；
   *   · **未被合并**（mergedIntoId 为空）—— 被合并的条目已经不代表任何东西，
   *     它的条码会顺着链找到最终条目，两条都送等于给对方送重复；
   *   · **可见的上报 > 0** —— 一件从未被任何来源报过的条目送过去没有信息量。
   */
  async candidates(limit: number): Promise<SyncCandidate[]> {
    const rows = await this.exportQuery().orderBy('i.updatedAt', 'ASC').limit(limit).getMany();

    const out: SyncCandidate[] = [];
    for (const row of rows) {
      const payload = await this.payloadOf(row);
      if (!payload) continue;
      out.push({
        row: (await this.stateOf(row.id)) ?? this.blankState(row),
        payload,
        payloadHash: hashOf(payload),
      });
    }
    return out;
  }

  /**
   * 单个条目的同步状态行；没有就现建一个（不落库，调用方决定何时 persist）。
   *
   * 之所以不在扫描时**立刻**建行：`candidates()` 是只读查询，把它变成写入会让
   * "看一眼待同步清单"这个动作产生副作用，界面上刷新两次就多出一堆 pending 行。
   */
  private async stateOf(itemId: number): Promise<OutboundSyncRow | null> {
    return outboundSyncRepo().findOne({ where: { catalogItemId: itemId } });
  }

  private blankState(row: CatalogItemRow): OutboundSyncRow {
    // 只是给 UI 一个形状；真正落库由 markXxx 系列做（它们会 upsert）
    return {
      id: 0,
      catalogItemId: row.id,
      barcode: row.barcode ?? null,
      transport: env.sync.transport,
      status: 'pending',
      attempts: 0,
      lastAttemptAt: null,
      syncedAt: null,
      lastError: null,
      remoteRef: null,
      payloadHash: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * 单条导出（`GET /api/v1/export/:barcode` 用）。
   *
   * 只按**最终条目**算：条码若被合并过，导出应当给出合并后的那一条，
   * 否则对方会同时收到"KALLAX 旧条目"和"KALLAX 新条目"两份互相矛盾的资料。
   */
  async exportOneByBarcode(barcodeRaw: string): Promise<SyncPayloadItem | null> {
    const normalized = barcodeRaw.trim();
    if (!normalized) return null;
    const row = await itemsRepo()
      .createQueryBuilder('i')
      .where('i.barcode = :barcode', { barcode: normalized })
      .andWhere('i.mergedIntoId IS NULL')
      .getOne();
    if (!row) return null;
    return this.payloadOf(row);
  }

  /** 把一个条目投影成载荷项；信息不全（无名无型号等）也照送，缺字段留 null */
  async payloadOf(item: CatalogItemRow): Promise<SyncPayloadItem | null> {
    if (!item.barcode) return null;
    const detail: ItemDetailView = await this.items.detail(item);
    return {
      id: detail.id,
      barcode: detail.barcode ?? item.barcode,
      name: detail.name,
      manufacturer: detail.manufacturer,
      model: detail.model,
      category: detail.category,
      description: detail.description,
      baseUnit: detail.baseUnit,
      // attributes 的内部分表示法带 `attributes.` 前缀，出站要还原成纯键
      attributes: stripAttributePrefix(detail.attributes),
      imageUrls: env.sync.includePhotos ? detail.imageUrls : [],
      contributions: detail.contributionCount,
      sources: detail.instanceCount,
      firstSeenAt: detail.firstSeenAt,
      updatedAt: detail.updatedAt,
      provenance: detail.fields
        .filter((field) => field.value !== null)
        .map((field) => ({
          field: field.field,
          // 展示名优先用来源键（`r:…`/`f:…`），没有就退回实例名 ——
          // 实例名在真实流量里恒为 null（上报全是匿名的），不能让对方以为来源空白
          label: field.source ?? field.instanceName ?? null,
          observedAt: field.observedAt ?? detail.updatedAt,
        })),
    };
  }

  /** 组一个批次的载荷（含格式版本与收集器信息，对方据此解析） */
  batchPayload(items: SyncPayloadItem[], generatedAt = isoNow()): SyncPayload {
    return {
      format: 'homebucket.collector.sync/1',
      generatedAt,
      collector: { version: env.version, dataFile: env.dataFile },
      count: items.length,
      items,
    };
  }

  /**
   * 跑一轮同步。
   *
   * 分页发送（`batchSize`）：条目多起来后一个 POST 全部送过去会先撞上对方的
   * 请求体上限，再撞上我方超时。分页后每批发一条，失败也只影响这一批。
   *
   * `force=true`（界面上"强制全量重传"）会忽略"载荷没变且上次成功"的跳过判定 ——
   * 对方数据库被清空重建时，没有这个开关就只能一条条去改数据触发重传。
   *
   * 串行化：并发调用时后到者直接 409（`sync.alreadyRunning`），不会和先到者并行跑。
   */
  async run(options: { limit?: number; force?: boolean; manager?: EntityManager } = {}): Promise<SyncRunResult> {
    if (activeRun) {
      throw conflict('sync.alreadyRunning', '同步正在进行中，请稍后重试');
    }
    const running = this.runOnce(options).finally(() => {
      activeRun = null;
    });
    activeRun = running;
    return running;
  }

  /** 一轮同步的实际实现。串行化由 `run()` 负责，这里只做业务。 */
  private async runOnce(
    options: { limit?: number; force?: boolean; manager?: EntityManager } = {},
  ): Promise<SyncRunResult> {
    const transport = transportOf();
    const limit = options.limit ?? env.sync.batchSize * 10;
    const result: SyncRunResult = {
      scanned: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      configured: transport !== null,
      errors: [],
    };
    if (!transport) return result;

    const candidates = await this.candidates(limit);
    result.scanned = candidates.length;
    if (candidates.length === 0) return result;

    // 载荷没变 + 上次送成功 + 没超次数 → 跳过。这一条是"定时全量同步"不把对方
    // 打挂的关键：默认每批 200 条，条目上千时每轮都重传全部是纯浪费。
    const due: SyncCandidate[] = [];
    for (const candidate of candidates) {
      if (!options.force && this.alreadySynced(candidate)) {
        result.skipped += 1;
        continue;
      }
      if (!this.isDue(candidate.row)) {
        result.skipped += 1;
        continue;
      }
      due.push(candidate);
    }
    if (due.length === 0) return result;

    const batchSize = Math.max(1, env.sync.batchSize);
    const total = Math.ceil(due.length / batchSize);
    for (let index = 0; index < total; index += 1) {
      const slice = due.slice(index * batchSize, (index + 1) * batchSize);
      const payload = this.batchPayload(slice.map((item) => item.payload));
      const sent = await transport.send(payload, { index, total });
      if (sent.ok) {
        result.sent += slice.length;
        // 整批成功才记 ok：单条失败无法从"批"的响应里分辨（对方接口未定），
        // 记成"这批都成功"比记成"不确定"更有用 —— 真有漏的，对方会回推差异。
        for (const item of slice) {
          await this.markOk(item, sent.remoteRef ?? null);
        }
      } else {
        result.failed += slice.length;
        const message = sent.error ?? '未知错误';
        for (const item of slice) {
          await this.markFailed(item, message);
          result.errors.push({ itemId: item.payload.id, barcode: item.payload.barcode, message });
        }
      }
    }
    return result;
  }

  /** 载荷没变且上次成功过 → 不必重传 */
  private alreadySynced(candidate: SyncCandidate): boolean {
    const { row } = candidate;
    return row.status === 'ok' && row.payloadHash === candidate.payloadHash;
  }

  /**
   * 是否到重试点。
   *
   * `attempts` 到上限后不再自动重试，但仍然显示在"失败"清单里 —— 静默放弃比
   * 一直重试更危险（对方看到清单一直是空的，会以为都同步好了）。
   */
  private isDue(row: OutboundSyncRow): boolean {
    if (row.status !== 'failed') return true;
    return row.attempts < env.sync.maxAttempts;
  }

  /** upsert 一行状态；`patch` 里给出的字段覆盖旧值 */
  private async upsert(item: SyncCandidate, patch: Partial<OutboundSyncRow>): Promise<void> {
    const repo = outboundSyncRepo();
    const existing = await repo.findOne({ where: { catalogItemId: item.payload.id } });
    const base: Partial<OutboundSyncRow> = {
      catalogItemId: item.payload.id,
      barcode: item.payload.barcode,
      transport: env.sync.transport,
      payloadHash: item.payloadHash,
    };
    if (existing) {
      await repo.update({ catalogItemId: item.payload.id }, { ...base, ...patch });
      return;
    }
    await repo.insert({ ...base, ...patch } as OutboundSyncRow);
  }

  private async markOk(item: SyncCandidate, remoteRef: string | null): Promise<void> {
    const now = isoNow();
    await this.upsert(item, {
      status: 'ok',
      attempts: item.row.attempts + 1,
      lastAttemptAt: now,
      syncedAt: now,
      lastError: null,
      remoteRef,
    });
  }

  private async markFailed(item: SyncCandidate, message: string): Promise<void> {
    await this.upsert(item, {
      status: 'failed',
      attempts: item.row.attempts + 1,
      lastAttemptAt: isoNow(),
      lastError: message.slice(0, 500),
      remoteRef: null,
    });
  }

  /**
   * 待同步/已同步/失败的清单（页面用）。
   *
   * `status` 为空时返回全部，并按"最该看的在前"排序：失败 → 待同步 → 已同步。
   */
  async list(status?: SyncStatus): Promise<{
    rows: Array<OutboundSyncRow & { name: string | null; imageUrls: string[] }>;
    counts: Record<SyncStatus | 'total', number>;
  }> {
    const repo = outboundSyncRepo();
    const counts = { total: 0, pending: 0, ok: 0, failed: 0 };
    const all = await repo.find({ order: { updatedAt: 'DESC' } });
    for (const row of all) {
      counts.total += 1;
      if (row.status === 'ok') counts.ok += 1;
      else if (row.status === 'failed') counts.failed += 1;
      else counts.pending += 1;
    }
    const filtered = status ? all.filter((row) => row.status === status) : all;

    // 一次取回所有相关条目，避免 N+1（清单可能几百行）
    const items = await itemsRepo().find({ where: filtered.map((row) => ({ id: row.catalogItemId })) });
    const byId = new Map(items.map((item) => [item.id, item]));
    const rows = filtered.map((row) => {
      const item = byId.get(row.catalogItemId);
      return {
        ...row,
        name: item?.name ?? null,
        imageUrls: item ? parseStringArray(item.imageUrls) : [],
      };
    });
    return { rows, counts };
  }

  /** 手动把某条目置为待同步（改完数据想立刻重送时用） */
  async reset(itemId: number): Promise<OutboundSyncRow | null> {
    const repo = outboundSyncRepo();
    const row = await repo.findOne({ where: { catalogItemId: itemId } });
    if (!row) return null;
    await repo.update({ catalogItemId: itemId }, { status: 'pending', attempts: 0, lastError: null });
    return repo.findOne({ where: { catalogItemId: itemId } });
  }

  /**
   * 只算不发的载荷预览（管理端"上行载荷预览"用）。
   *
   * 与真正发送走**同一个** `payloadOf()`，所以预览与实际发送不可能不一致 ——
   * 这正是不让页面自己拼一份"看起来差不多"的 JSON 的原因。
   */
  async previewOf(itemId: number): Promise<SyncPayload | null> {
    const item = await itemsRepo().findOne({ where: { id: itemId } });
    if (!item) return null;
    const one = await this.payloadOf(item);
    if (!one) return null;
    return this.batchPayload([one]);
  }

  /** 导出方向的可导出条目总数（与 candidates 同一筛选条件，保证两个方向看到同一批） */
  async exportCount(): Promise<number> {
    return this.exportQuery().getCount();
  }

  /** 导出方向的一页载荷项（`skip`/`take` 由路由按分页算好） */
  async exportPage(skip: number, take: number): Promise<SyncPayloadItem[]> {
    const rows = await this.exportQuery().orderBy('i.updatedAt', 'ASC').skip(skip).take(take).getMany();
    const out: SyncPayloadItem[] = [];
    for (const row of rows) {
      const item = await this.payloadOf(row);
      if (item) out.push(item);
    }
    return out;
  }

  /**
   * 导出与推送共用的筛选条件。
   *
   * 抽出来是因为它必须**逐字一致**：如果导出能拉到推送不认的条目（或反之），
   * 对方按导出对账时就会一直报"你少给了我 N 条"，而两边都"看起来"是对的。
   */
  private exportQuery() {
    return itemsRepo()
      .createQueryBuilder('i')
      .where('i.barcode IS NOT NULL')
      .andWhere('i.mergedIntoId IS NULL')
      .andWhere('i.contributionCount > 0');
  }
}

/** `attributes.<key>` → `<key>`；不带前缀的原样返回（兼容早期数据） */
function stripAttributePrefix(attributes: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(attributes)) {
    out[key.startsWith('attributes.') ? key.slice('attributes.'.length) : key] = value;
  }
  return out;
}

/** 载荷指纹：只用于"变了没有"的判断，不要求抗碰撞 */
function hashOf(item: SyncPayloadItem): string {
  return createHash('sha256').update(JSON.stringify(item)).digest('hex');
}

function parseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}
