import { Module } from '@nestjs/common';
import { CollectionModule } from '../collection/collection.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

/**
 * 实例设置模块。
 *
 * 引入 `CollectionModule` 只为拿到 `CollectionSyncService.reregister()` ——
 * 保存「定时上报」开关或 cron 表达式后要重新注册那个 job。
 * 注意**不要**在这里 import `@nestjs/schedule`：`notifications.test.mjs` 有一条收口断言，
 * 要求那个包只出现在 `src/collection/**`（那里才允许有定时任务），
 * 这里的做法是"注入拥有者、调用它的方法"，把 scheduler 的用法留在原地。
 *
 * 不写 `TypeOrmModule.forFeature`：`DatabaseModule` 是 @Global 的，已导出全部实体的 Repository。
 */
@Module({
  imports: [CollectionModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
