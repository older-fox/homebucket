import { Module } from '@nestjs/common';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';

/**
 * 扫码模块（职责：只做 @Module 声明）。
 *
 * 路径与类名保持不变（app.module.ts 按 './scan/scan.module' 引入）。
 * 不写 TypeOrmModule.forFeature：DatabaseModule 是 @Global 的，已导出全部实体 Repository。
 */
@Module({
  controllers: [ScanController],
  providers: [ScanService],
})
export class ScanModule {}
