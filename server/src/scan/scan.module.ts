import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';

/**
 * 扫码模块（职责：只做 @Module 声明）。
 *
 * 路径与类名保持不变（app.module.ts 按 './scan/scan.module' 引入）。
 * 不写 TypeOrmModule.forFeature：DatabaseModule 是 @Global 的，已导出全部实体 Repository。
 */
@Module({
  imports: [ActivityModule],
  controllers: [ScanController],
  providers: [ScanService],
  // v1 写接口的取走/归还复用这一份解析（条码/追溯码/二维码/SN → 目标），
  // 所以必须导出，而不是让 v1 自己再写一套 findTarget
  exports: [ScanService],
})
export class ScanModule {}
