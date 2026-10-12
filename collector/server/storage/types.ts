import { createHash } from 'node:crypto';

/**
 * 照片存储抽象：把"照片放在哪里"从"照片是什么"里剥离开。
 *
 * 为什么要有这层：同一套上传/取图/去重逻辑要在两种部署下都成立 ——
 * 小规模自建（本机磁盘，零依赖）和后面对接对象存储（S3 兼容，多实例共享）。
 * 若把 fs 调用散在路由里，接 S3 时就得改路由；反过来把 S3 写死，本机部署就得被迫跑 MinIO。
 *
 * 接口刻意只保留 4 个动作（put/get/delete/urlFor）：够用，且能同时被
 * 本地文件（有目录、有路径）与对象存储（只有 key、只有 URL）实现。
 */

export interface StoredPhoto {
  /** 内容 sha256（十六进制）—— 内容寻址：同样的图片只存一份 */
  hash: string;
  /** 存储层的键（本地驱动＝分桶相对路径；S3 驱动＝object key） */
  storageKey: string;
  bytes: number;
  mime: string;
  /** 扩展名，含点（`.jpg`）—— 让静态托管按正确 Content-Type 返回 */
  ext: string;
}

export interface PhotoStorage {
  /** 驱动名，落库与展示用（`local` / `s3`） */
  readonly driver: 'local' | 's3';
  /**
   * 写入一张照片。内容哈希已存在时**不应重复写入**（调用方会先查库），
   * 但驱动本身也必须幂等：同一份内容重复 put 只产生同一份数据。
   */
  put(input: { hash: string; ext: string; mime: string; bytes: Buffer; storageKey: string }): Promise<string>;
  /** 读回一张照片；不存在返回 null（让路由能区分 404 与 500） */
  get(storageKey: string): Promise<Buffer | null>;
  /** 删除；不存在也算成功（幂等，避免重试时卡在"第二次删就报错"） */
  delete(storageKey: string): Promise<void>;
  /**
   * 对外可访问的地址。
   * 本地驱动默认返回本站路径 `/api/photos/<key>`；
   * 配了 CDN/公开域名（`COLLECTOR_PHOTO_PUBLIC_BASE`）时返回拼接后的绝对地址，
   * 因为实例端拿到的是要写进自己数据库的地址，走后端接口回源会平白多一跳。
   */
  urlFor(storageKey: string): string;
}

/** 允许的图片类型：magic bytes → mime/扩展名。刻意不信任上报的 Content-Type */
export const ALLOWED_PHOTO_TYPES: ReadonlyArray<{
  mime: string;
  ext: string;
  /** 用来判定文件头是否匹配 */
  matches: (head: Buffer) => boolean;
}> = [
  {
    mime: 'image/png',
    ext: '.png',
    // 89 50 4E 47 0D 0A 1A 0A
    matches: (head) =>
      head.length >= 8 &&
      head[0] === 0x89 &&
      head[1] === 0x50 &&
      head[2] === 0x4e &&
      head[3] === 0x47 &&
      head[4] === 0x0d &&
      head[5] === 0x0a &&
      head[6] === 0x1a &&
      head[7] === 0x0a,
  },
  {
    mime: 'image/jpeg',
    ext: '.jpg',
    // FF D8 FF
    matches: (head) => head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff,
  },
  {
    mime: 'image/webp',
    ext: '.webp',
    // 'RIFF' … 'WEBP'
    matches: (head) =>
      head.length >= 12 &&
      head.subarray(0, 4).toString('latin1') === 'RIFF' &&
      head.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  {
    mime: 'image/gif',
    ext: '.gif',
    // 'GIF87a' / 'GIF89a'
    matches: (head) =>
      head.length >= 6 && (head.subarray(0, 6).toString('latin1') === 'GIF87a' || head.subarray(0, 6).toString('latin1') === 'GIF89a'),
  },
];

/**
 * 按文件头判定类型。
 *
 * 为什么不看上传者给的 Content-Type / 文件名后缀：两者都由客户端随便填，
 * 把一个可执行文件命名为 `a.png` 并声明 `image/png` 是零成本的。
 * 文件头是文件内容的一部分，伪造它就得真的产出合法图片的起始字节。
 * 判定失败就拒收（返回 null），不做"猜一个类型"的兜底 —— 存进去的
 * 脏数据最终会被浏览器和下游上游同步一起消费，代价远高于让上传方改一次。
 */
export function detectPhotoType(head: Buffer): { mime: string; ext: string } | null {
  for (const candidate of ALLOWED_PHOTO_TYPES) {
    if (candidate.matches(head)) return { mime: candidate.mime, ext: candidate.ext };
  }
  return null;
}

/** 内容哈希（十六进制 sha256）—— 照片去重的唯一依据（同一张图别存成三份） */
export function hashOfPhoto(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * 分桶键：`<hash 前 2 位>/<hash 前 4 位>/<hash><ext>`。
 *
 * 直接把几万张图平铺在一个目录里，`readdir` 与 ext4 的目录索引都会变慢；
 * 两级前缀把文件摊到最多 256 / 65536 个子目录，且前缀仍由哈希决定
 * （不需要额外索引就能由 hash 推出路径）。S3 驱动共用同一套键，
 * 只是它那边分桶对列举性能的影响小得多 —— 统一键规则省掉"两套路径"的心智负担。
 */
export function storageKeyOf(hash: string, ext: string): string {
  return `${hash.slice(0, 2)}/${hash.slice(0, 4)}/${hash}${ext}`;
}
