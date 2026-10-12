import { Injectable } from '@nestjs/common';
import { env } from '../config/env';

/**
 * 收集器 v1 实例协议的客户端（只做 HTTP，不含任何业务判断）。
 *
 * ── 为什么不再打老契约 `/observations` ──
 * 老契约是匿名的：收集器认不出上报方，于是这条上报**不参与投票**、也没法被反馈纠正
 * （见收集器 README「来源管理」）。而定时全量上报要的就是"多实例交叉印证"，
 * 匿名等于白报。所以这里走 v1：注册拿 key → 每次带 `x-collector-key` 上报。
 *
 * ── 错误为什么分类而不是只抛异常 ──
 * 调用方（定时任务）对不同失败的处理完全不同：凭据失效要重注册、被封禁要整轮中止、
 * 限流要按 retryAfter 退避、单张图被拒要跳过这一个继续跑下一个。
 * 把这些判断压在错误类型里，定时任务就不用去解析 HTTP 状态码和 code 字符串。
 */

export interface RegisteredInstance {
  key: string;
  keyPrefix: string;
  instanceId: number | null;
  instanceName: string;
}

export interface ContributionPayload {
  barcode: string;
  name?: string | null;
  description?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  baseUnit?: string | null;
  imageUrls?: string[];
}

export interface ContributionAccepted {
  created: boolean;
  applied: string[];
  contributionId: number;
  /** 内容指纹命中已有上报：没有新写流水 */
  deduped: boolean;
  /** 收集器还缺不缺这个物品的照片 */
  wantsPhotos: boolean;
}

export interface PhotoAccepted {
  url: string;
  deduped: boolean;
}

export type CollectorErrorKind =
  /** 请求没带凭据 / 收集器认不出这把 key（需要重注册） */
  | 'keyInvalid'
  /** 实例被封禁：不该重注册，重注册等于绕过封禁 */
  | 'blocked'
  /** 收集器关了新实例注册 */
  | 'registrationClosed'
  /** 限流：retryAfterSeconds 是可信的退避时长 */
  | 'rateLimited'
  /** 图片仍带元数据（EXIF/GPS）：这一种对同一张图是永久失败 */
  | 'metadataForbidden'
  /** 请求本身有问题（条码非法、字段超长…）：对同一条数据也是永久失败 */
  | 'badRequest'
  | 'network'
  | 'server';

export interface CollectorError {
  kind: CollectorErrorKind;
  status: number | null;
  retryAfterSeconds: number | null;
  message: string;
}

export type CollectorResult<T> = { ok: true; data: T } | { ok: false; error: CollectorError };

/**
 * Buffer → ArrayBuffer：Blob 只吃 `ArrayBuffer`，而 Buffer 的类型是
 * `ArrayBufferLike`（可能是 SharedArrayBuffer），直接塞进去类型过不了。
 * 拷一份而不是复用底层内存：这份字节马上要交给 fetch，拷贝的开销远小于
 * 多持有一次 Buffer 引用带来的生命周期疑问。
 */
function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

@Injectable()
export class CollectorClient {
  /**
   * `DATA_COLLECTION_ENDPOINT` 是**API 基址**（形如 `http://host:3400/api/v1`），
   * 不是站点根：老契约的 `${endpoint}/observations`、`${endpoint}/barcodes/:code`
   * 就是按这个约定写的。所以这里的路径都**不带** `/api/v1` 前缀 —— 再拼一次会变成
   * `/api/v1/api/v1/...`，收集器只会回 404。
   */
  private get base(): string {
    return env.dataCollectionEndpoint;
  }

  /**
   * 注册一个实例，拿回只出现一次的 key。
   *
   * 响应是**扁平**的：`{ id, name, key, keyPrefix, createdAt, note }`
   * （`id`/`name` 就是实例本身的，没有再包一层 `instance`）。
   */
  async register(name: string): Promise<CollectorResult<RegisteredInstance>> {
    const result = await this.call<{
      id?: number;
      name?: string;
      key?: string;
      keyPrefix?: string;
    }>('/instances', {
      method: 'POST',
      json: { name, platform: 'homebucket', version: '1' },
    });
    if (!result.ok) return result;

    const raw = result.data;
    if (!raw.key) {
      return {
        ok: false,
        error: { kind: 'server', status: null, retryAfterSeconds: null, message: '注册响应里没有 key' },
      };
    }
    return {
      ok: true,
      data: {
        key: raw.key,
        keyPrefix: raw.keyPrefix ?? raw.key.slice(0, 12),
        instanceId: typeof raw.id === 'number' ? raw.id : null,
        instanceName: raw.name ?? name,
      },
    };
  }

  /** 上报文字字段（有 key 时带凭据）；返回里带"还缺不缺照片" */
  async contribute(
    key: string | null,
    payload: ContributionPayload,
  ): Promise<CollectorResult<ContributionAccepted>> {
    return this.call<ContributionAccepted>('/contributions', {
      method: 'POST',
      json: payload as unknown as Record<string, unknown>,
      key,
    });
  }

  /**
   * 上传一张照片（multipart）。
   *
   * 用 Node 原生的 FormData/Blob：不引入任何依赖，且 undici 会自动算出
   * content-length —— 收集器的请求体上限中间件靠这个字段提前拦截大包，
   * 走 chunked 的话那道闸就形同虚设了。
   */
  async uploadPhoto(
    key: string | null,
    bytes: Buffer,
    mime: string,
    filename: string,
  ): Promise<CollectorResult<PhotoAccepted>> {
    const form = new FormData();
    form.append('file', new Blob([toArrayBuffer(bytes)], { type: mime }), filename);

    return this.call<PhotoAccepted>('/photos', {
      method: 'POST',
      body: form,
      key,
      timeoutMs: env.dataCollectionPhotoTimeoutMs,
    });
  }

  private async call<T>(
    path: string,
    options: {
      method: 'POST' | 'GET';
      json?: Record<string, unknown>;
      body?: FormData;
      key?: string | null;
      timeoutMs?: number;
    },
  ): Promise<CollectorResult<T>> {
    const url = `${this.base}${path}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.key) headers['x-collector-key'] = options.key;

    let body: string | FormData | undefined;
    if (options.json) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.json);
    } else if (options.body) {
      body = options.body;
    }

    try {
      const response = await fetch(url, {
        method: options.method,
        headers,
        body,
        signal: AbortSignal.timeout(options.timeoutMs ?? env.dataCollectionTimeoutMs),
      });
      const payload = await this.readJson(response);
      if (!response.ok) {
        return { ok: false, error: this.classify(response.status, payload) };
      }
      return { ok: true, data: payload as T };
    } catch (error) {
      const message = (error as Error).message || String(error);
      // AbortSignal.timeout 超时也落在这里：对调用方而言与网络故障同等对待
      return { ok: false, error: { kind: 'network', status: null, retryAfterSeconds: null, message } };
    }
  }

  private async readJson(response: Response): Promise<Record<string, unknown>> {
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  /** 把 HTTP 状态码 + 收集器的错误 code 翻译成调用方能直接分支的类别 */
  private classify(status: number, payload: Record<string, unknown>): CollectorError {
    const code = typeof payload.code === 'string' ? payload.code : '';
    const message = typeof payload.message === 'string' ? payload.message : `HTTP ${status}`;
    const retryAfterSeconds =
      typeof payload.retryAfterSeconds === 'number' ? payload.retryAfterSeconds : null;

    if (status === 401) {
      // 收集器明确区分了"没带"与"带了但不认"，后者才需要重注册
      return { kind: 'keyInvalid', status, retryAfterSeconds, message };
    }
    if (status === 403) {
      return {
        kind: code === 'instance.blocked' ? 'blocked' : 'registrationClosed',
        status,
        retryAfterSeconds,
        message,
      };
    }
    if (status === 429) {
      return { kind: 'rateLimited', status, retryAfterSeconds, message };
    }
    if (code === 'photo.metadataForbidden') {
      return { kind: 'metadataForbidden', status, retryAfterSeconds, message };
    }
    if (status >= 400 && status < 500) {
      return { kind: 'badRequest', status, retryAfterSeconds, message };
    }
    return { kind: 'server', status, retryAfterSeconds, message };
  }
}
