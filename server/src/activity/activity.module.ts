import { Module } from '@nestjs/common';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

/**
 * 操作历史模块。被 items / scan / locations / templates 复用（导入本模块拿到 ActivityService）。
 * 不写 TypeOrmModule.forFeature：DatabaseModule 是 @Global 的，已导出全部实体 Repository。
 */
@Module({
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
