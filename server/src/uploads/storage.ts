import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

export interface StorageDriver {
  /** 写入文件；返回可公开访问的完整 url（local 模式返回空，前端用 /api/media/<key>） */
  put(key: string, data: Buffer, mime: string): Promise<{ url?: string }>;
  remove(key: string): Promise<void>;
}

class LocalStorage implements StorageDriver {
  async put(key: string, data: Buffer): Promise<{ url?: string }> {
    const file = resolve(env.uploadDir, key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
    return {};
  }

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

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: env.s3Bucket, Key: key }));
  }
}

export const storageProvider = {
  provide: STORAGE_DRIVER,
  useFactory: (): StorageDriver => (env.storageDriver === 's3' ? new S3Storage() : new LocalStorage()),
};
