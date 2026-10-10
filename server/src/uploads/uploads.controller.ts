// Express.Multer.File 的类型由 tsconfig 的 "types": [..., "multer"] 提供（原因见 uploads.service.ts 顶部注释）
import {
  Controller,
  Delete,
  Get,
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
import { uploadLimits } from '../config/env';
import { UploadsService } from './uploads.service';

/** 附件的 HTTP 入口；上传大小限制来自配置，权限由 @FamilyScoped() 守卫保证 */
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
