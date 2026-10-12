import { env } from '../utils/env';
import { LocalPhotoStorage } from './local';
import { S3PhotoStorage } from './s3';
import type { PhotoStorage } from './types';

export * from './types';
export { LocalPhotoStorage, S3PhotoStorage };

let cached: PhotoStorage | null = null;

/**
 * 当前照片存储驱动（进程内单例）。
 *
 * 惰性构造 + 缓存：驱动构造会读配置，而配置在进程启动后不再变化；
 * 每个请求都 new 一个 S3PhotoStorage 会白白重算签名密钥。
 * 单例还让"配置错误"在第一次使用时抛错、被路由包装成 500 而不是启动即崩 ——
 * 这样即使照片配置写错，收集器的查询/投票仍能正常工作。
 */
export function photoStorage(): PhotoStorage {
  if (cached !== null) return cached;
  cached = env.photo.driver === 's3'
    ? new S3PhotoStorage({
        endpoint: env.photo.s3.endpoint,
        region: env.photo.s3.region,
        bucket: env.photo.s3.bucket,
        accessKeyId: env.photo.s3.accessKeyId,
        secretAccessKey: env.photo.s3.secretAccessKey,
        prefix: env.photo.s3.prefix,
        forcePathStyle: env.photo.s3.forcePathStyle,
        publicBase: env.photo.s3.publicBase ?? env.photo.publicBase,
      })
    : new LocalPhotoStorage(env.photo.localDir, env.photo.publicBase);
  return cached;
}

/** 测试用：清掉缓存（换配置/换目录后重新构造） */
export function resetPhotoStorage(): void {
  cached = null;
}
