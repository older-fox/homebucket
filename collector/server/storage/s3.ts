import { createHash, createHmac } from 'node:crypto';
import { badRequest } from '../utils/http';
import type { PhotoStorage } from './types';

/**
 * S3 兼容对象存储驱动（AWS S3 / MinIO / 阿里云 OSS 的 S3 端点 / Cloudflare R2 …）。
 *
 * ── 为什么不引 @aws-sdk/client-s3 ──
 * 只用得上 PutObject / GetObject / DeleteObject 三个动作，而 AWS SDK v3 会带进
 * 十几个包、几十 MB 依赖，还得跟着它升版本。SigV4 的签名算法本身是固定的
 * 几段 HMAC-SHA256，这里手写一份反而更好审计、也没有供应链更新负担。
 * 代价是**只支持 V4 签名与 path-style/virtual-hosted 两种寻址**，够覆盖上面几个服务。
 *
 * ── 失败一律抛错，不静默降级到本地 ──
 * 若 S3 写失败就悄悄写到本地磁盘，运维会看到"上传成功"，但另一台实例永远取不到图，
 * 且重启后数据落在一台机器的容器里 —— 这类问题排查成本极高。宁可让上传直接失败。
 */
export class S3PhotoStorage implements PhotoStorage {
  readonly driver = 's3' as const;

  constructor(
    private readonly config: {
      endpoint: string;
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      /** 对象键前缀，便于在同一 bucket 里与其他数据隔离 */
      prefix: string;
      forcePathStyle: boolean;
      /** 公开访问基地址（CDN 域名）；为空则用 endpoint+eucket 拼 */
      publicBase: string | null;
    },
  ) {
    // 构造期就校验，而不是等第一次上传才报错：配置错误应该在启动时暴露
    if (!config.endpoint || !config.bucket || !config.accessKeyId || !config.secretAccessKey) {
      throw badRequest(
        'storage.s3ConfigIncomplete',
        'S3 驱动缺少必要配置：ENDPOINT / BUCKET / ACCESS_KEY_ID / SECRET_ACCESS_KEY',
      );
    }
    if (!/^https?:\/\//i.test(config.endpoint)) {
      throw badRequest('storage.s3EndpointInvalid', 'S3 ENDPOINT 必须是 http(s) 地址');
    }
  }

  async put(input: { hash: string; ext: string; mime: string; bytes: Buffer; storageKey: string }): Promise<string> {
    const { url } = this.objectUrl(input.storageKey);
    // 用 PUT 直接覆盖：内容寻址下键相同即内容相同，重复上传没有副作用，
    // 也就不必先 HEAD 一次（那会让上传变成两次往返）
    await this.send('PUT', url, input.storageKey, input.bytes, { 'content-type': input.mime });
    return input.storageKey;
  }

  async get(storageKey: string): Promise<Buffer | null> {
    const { url } = this.objectUrl(storageKey);
    const response = await this.send('GET', url, storageKey);
    if (response.status === 404) return null;
    // S3 的 403 在"对象不存在但无权 ListBucket"时也会出现；为了不让取图路由
    // 把"图不在"报成 500，这里也按未找到处理（取不到就是取不到）
    if (response.status === 403) return null;
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(storageKey: string): Promise<void> {
    const { url } = this.objectUrl(storageKey);
    const response = await this.send('DELETE', url, storageKey);
    // S3 的 DELETE 对不存在的键也返回 204（幂等），符合接口约定
    if (response.status >= 400 && response.status !== 404) {
      throw new Error(`删除对象失败：HTTP ${response.status} ${storageKey}`);
    }
  }

  urlFor(storageKey: string): string {
    const { url } = this.objectUrl(storageKey);
    return url.toString();
  }

  /** 对象键 = 前缀 + 分桶键（前缀两端多余的 `/` 归一掉，避免出现 `//`） */
  private keyOf(storageKey: string): string {
    const prefix = this.config.prefix.replace(/^\/+|\/+$/g, '');
    return prefix === '' ? storageKey : `${prefix}/${storageKey}`;
  }

  /** 寻址：path-style（MinIO 常用）与 virtual-hosted（AWS 默认）两种 */
  private objectUrl(storageKey: string): { url: URL; key: string } {
    const key = this.keyOf(storageKey);
    const endpoint = new URL(this.config.endpoint);
    const publicBase = this.config.publicBase;
    // 展示用地址：配了公开域名就直接用（默认 path-style），否则与请求地址一致
    if (publicBase !== null && publicBase !== '') {
      return { url: new URL(`${publicBase.replace(/\/+$/, '')}/${key}`), key };
    }
    if (this.config.forcePathStyle) {
      return { url: new URL(`${endpoint.origin}/${this.config.bucket}/${key}`), key };
    }
    const host = `${this.config.bucket}.${endpoint.host}`;
    return { url: new URL(`${endpoint.protocol}//${host}/${key}`), key };
  }

  /** 发一次带 SigV4 签名的请求（url 由 objectUrl 统一给出，已是 URL 对象） */
  private async send(
    method: string,
    rawUrl: URL,
    storageKey: string,
    body?: Buffer,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    const url = rawUrl;
    // 签名用的路径必须是**已编码**的形式，且空路径表示成 `/`，
    // 否则带空格/中文的键签名与实际请求不一致（S3 会报 SignatureDoesNotMatch）
    const canonicalUri = url.pathname === '' ? '/' : url.pathname;
    const payloadHash = createHash('sha256')
      .update(body ?? Buffer.alloc(0))
      .digest('hex');
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const headers: Record<string, string> = {
      host: url.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...extraHeaders,
    };

    const signedHeaderNames = Object.keys(headers)
      .map((name) => name.toLowerCase())
      .sort();
    const canonicalHeaders = signedHeaderNames
      .map((name) => `${name}:${String(headers[name] ?? headers[name.toLowerCase()] ?? '').trim()}\n`)
      .join('');
    const signedHeaders = signedHeaderNames.join(';');
    const canonicalRequest = [
      method,
      canonicalUri,
      url.searchParams.toString(),
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const signingKey = this.signingKey(dateStamp);
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const authorization =
      `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return fetch(url, {
      method,
      headers: { ...headers, authorization },
      body: body === undefined ? undefined : new Uint8Array(body),
    });
  }

  /** SigV4 的派生密钥：kDate → kRegion → kService → kSigning */
  private signingKey(dateStamp: string): Buffer {
    const kDate = createHmac('sha256', `AWS4${this.config.secretAccessKey}`).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(this.config.region).digest();
    const kService = createHmac('sha256', kRegion).update('s3').digest();
    return createHmac('sha256', kService).update('aws4_request').digest();
  }
}
