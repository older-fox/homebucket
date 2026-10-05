import { randomBytes } from 'node:crypto';
import { extname } from 'node:path';
import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentFamily, CurrentUser, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { uploadLimits } from '../config/env';
import { STORAGE_DRIVER, storageProvider, type StorageDriver } from './storage';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
};

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
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

    const row = await this.prisma.attachment.create({
      data: {
        familyId,
        key,
        url: url ?? null,
        mime: file.mimetype,
        size: file.size,
        uploadedById: userId,
      },
      select: { id: true, key: true, url: true, mime: true, size: true },
    });

    return { ...row, url: row.url || `/api/media/${row.key}` };
  }

  async get(familyId: number, id: number) {
    const row = await this.prisma.attachment.findFirst({
      where: { id, familyId },
      select: { id: true, key: true, url: true, mime: true, size: true, createdAt: true },
    });
    if (!row) throw new NotFoundException({ code: 'upload.notFound', message: '文件不存在' });
    return { ...row, url: row.url || `/api/media/${row.key}` };
  }

  async remove(familyId: number, id: number) {
    const row = await this.prisma.attachment.findFirst({
      where: { id, familyId },
      select: { id: true, key: true },
    });
    if (!row) throw new NotFoundException({ code: 'upload.notFound', message: '文件不存在' });

    await this.storage.remove(row.key);
    await this.prisma.attachment.delete({ where: { id } });
    return { ok: true };
  }
}

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @FamilyScoped()
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: uploadLimits() }))
  upload(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.uploads.save(file, family.id, user.id);
  }

  @FamilyScoped()
  @Get(':id')
  get(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.uploads.get(family.id, id);
  }

  @FamilyScoped()
  @Delete(':id')
  remove(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.uploads.remove(family.id, id);
  }
}

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, storageProvider],
  exports: [UploadsService],
})
export class UploadsModule {}
