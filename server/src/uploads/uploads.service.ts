// 为什么需要上面这行：本项目跑的是 TypeScript 6，@types 只在被 import 时才加载，
// 而没有任何源文件 import 'multer'，所以 @types/multer 的全局 `Express.Multer` 增强不会自动生效。
// 这里显式引用一次即可保留 `Express.Multer.File` 这个原始注解（不加就得自己手写结构类型）。
import { randomBytes } from 'node:crypto';
import { extname } from 'node:path';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { mediaUrl } from '../common/media';
import { Attachment } from '../entities/attachment.entity';
import { STORAGE_DRIVER, type StorageDriver } from './storage';

/** 有些浏览器上传时不给扩展名，用 mime 兜底 */
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
};

/**
 * 附件的落盘 + 元数据入库。
 * 存储细节交给注入的 StorageDriver（local / s3），这里只管 key 生成与 Attachment 表读写。
 */
@Injectable()
export class UploadsService {
  constructor(
    @InjectRepository(Attachment)
    private readonly attachments: Repository<Attachment>,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  async save(file: Express.Multer.File, familyId: number, userId: number) {
    if (!file) {
      throw new BadRequestException({ code: 'upload.fileRequired', message: '请选择要上传的文件' });
    }

    const now = new Date();
    const ext = extname(file.originalname || '') || EXT_BY_MIME[file.mimetype] || '';
    const key = `${familyId}/${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}/${randomBytes(8).toString('hex')}${ext}`;

    const { url } = await this.storage.put(key, file.buffer, file.mimetype);

    const row = await this.attachments.save(
      this.attachments.create({
        familyId,
        key,
        url: url ?? null,
        mime: file.mimetype,
        size: file.size,
        uploadedById: userId,
      }),
    );

    // mediaUrl() 与旧代码的内联 `/api/media/<key>` 完全等价（url 为空时回退到本地静态目录）
    return { id: row.id, key: row.key, url: mediaUrl(row), mime: row.mime, size: row.size };
  }

  async get(familyId: number, id: number) {
    const row = await this.attachments.findOne({ where: { id, familyId } });
    if (!row) throw new NotFoundException({ code: 'upload.notFound', message: '文件不存在' });

    // 显式映射：只暴露这几列，整行加载会把 storageKey 等内部字段一并吐出去
    return {
      id: row.id,
      key: row.key,
      url: mediaUrl(row),
      mime: row.mime,
      size: row.size,
      createdAt: row.createdAt,
    };
  }

  async remove(familyId: number, id: number) {
    // 只需要 key 去删文件，不必整行加载
    const row = await this.attachments.findOne({
      where: { id, familyId },
      select: { id: true, key: true },
    });
    if (!row) throw new NotFoundException({ code: 'upload.notFound', message: '文件不存在' });

    await this.storage.remove(row.key);
    await this.attachments.delete({ id });
    return { ok: true };
  }
}
