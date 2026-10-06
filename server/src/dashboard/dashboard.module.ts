import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * 首页概览模块（职责：只做 @Module 声明）。
 *
 * 路径与类名保持不变（app.module.ts 按 './dashboard/dashboard.module' 引入）。
 * 不写 TypeOrmModule.forFeature：DatabaseModule 是 @Global 的，已导出全部实体 Repository。
 */
@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
