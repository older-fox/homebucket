import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { storageProvider } from './storage';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, storageProvider],
  exports: [UploadsService],
})
export class UploadsModule {}
