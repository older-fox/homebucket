import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { env } from '../config/env';

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

export interface StorageDriver {
  /** 写入文件；返回可公开访问的完整 url（local 模式返回空，前端用 /api/media/<key>） */
  put(key: string, data: Buffer, mime: string): Promise<{ url?: string }>;
  /** 读回文件字节；不存在返回 null（让调用方能区分"文件丢了"与"读失败"） */
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

/** 判定 GetObject 的"对象不存在"：S3 给 NoSuchKey，部分兼容实现只给 404 */
function isMissingObject(error: unknown): boolean {
  const { name, $metadata } = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return name === 'NoSuchKey' || name === 'NotFound' || $metadata?.httpStatusCode === 404;
}

class LocalStorage implements StorageDriver {
  async put(key: string, data: Buffer): Promise<{ url?: string }> {
    const file = resolve(env.uploadDir, key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
    return {};
  }

  async get(key: string): Promise<Buffer | null> {
    const root = resolve(env.uploadDir);
    const file = resolve(root, key);
    // key 来自数据库，可能被写成 ../../etc/passwd 之类；解析后必须仍在上传目录内，
    // 否则当作"文件不存在"，绝不读出去
    if (file !== root && !file.startsWith(root + sep)) return null;

    try {
      return await readFile(file);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      // 只吞掉"路径不存在"，权限/IO 之类的错误照常抛出，避免把故障伪装成文件丢失
      if (code === 'ENOENT' || code === 'ENOTDIR') return null;
      throw e;
    }
  }

  // 注意：这里同样没有校验解析后的路径是否在上传目录内（与 put 一样的路径穿越隐患），
  // 本次为了保持 remove 行为不变而没有动它。
  async remove(key: string): Promise<void> {
    await rm(resolve(env.uploadDir, key), { force: true });
  }
}

class S3Storage implements StorageDriver {
  private readonly client = new S3Client({
    endpoint: env.s3Endpoint,
    region: env.s3Region,
    forcePathStyle: env.s3ForcePathStyle,
    credentials: env.s3AccessKey
      ? { accessKeyId: env.s3AccessKey, secretAccessKey: env.s3SecretKey }
      : undefined,
  });

  async put(key: string, data: Buffer, mime: string): Promise<{ url?: string }> {
    await this.client.send(
      new PutObjectCommand({ Bucket: env.s3Bucket, Key: key, Body: data, ContentType: mime }),
    );
    if (!env.s3Endpoint) return { url: `https://${env.s3Bucket}.s3.${env.s3Region}.amazonaws.com/${key}` };
    return { url: `${env.s3Endpoint.replace(/\/+$/, '')}/${env.s3Bucket}/${key}` };
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const { Body } = await this.client.send(
        new GetObjectCommand({ Bucket: env.s3Bucket, Key: key }),
      );
      if (!Body) return null;
      return Buffer.from(await Body.transformToByteArray());
    } catch (e) {
      // 对象不存在 → 返回 null；网络/权限等其它错误照常抛出
      if (isMissingObject(e)) return null;
      throw e;
    }
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: env.s3Bucket, Key: key }));
  }
}

export const storageProvider = {
  provide: STORAGE_DRIVER,
  useFactory: (): StorageDriver => (env.storageDriver === 's3' ? new S3Storage() : new LocalStorage()),
};
