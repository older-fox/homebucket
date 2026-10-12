import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { storageProvider } from './storage';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, storageProvider],
  // 导出驱动：别的模块（如定时任务）可以直接注入 STORAGE_DRIVER 读字节
  exports: [UploadsService, storageProvider],
})
export class UploadsModule {}
