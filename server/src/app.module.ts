import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { ActivityModule } from './activity/activity.module';
import { AuthModule } from './auth/auth.module';
import { CollectionModule } from './collection/collection.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FamiliesModule } from './families/families.module';
import { ItemsModule } from './items/items.module';
import { AppLogger } from './logger/app.logger';
import { AccessLogMiddleware } from './logger/access-log.middleware';
import { LocationsModule } from './locations/locations.module';
import { NotifiersModule } from './notifiers/notifiers.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SettingsModule } from './settings/settings.module';
import { SetupModule } from './setup/setup.module';
import { DatabaseModule } from './database/database.module';
import { ScanModule } from './scan/scan.module';
import { SearchModule } from './search/search.module';
import { TagsModule } from './tags/tags.module';
import { TemplatesModule } from './templates/templates.module';
import { UploadsModule } from './uploads/uploads.module';
import { V1Module } from './v1/v1.module';
import { env } from './config/env';

@Module({
  imports: [
    /*
     * 调度器放在最前面：它注册的是全局的 cron 注册表，而各模块的 onModuleInit
     * 会往里登记任务（条码收集就是这么挂上去的），注册表必须先存在。
     *
     * 仓库里唯一的定时任务在 src/collection/（条码全量上报）；其余模块（尤其是通知）
     * 仍然坚持"按需计算"，test/notifications.test.mjs 盯着这条边界。
     */
    ScheduleModule.forRoot(),
    DatabaseModule,
    CollectionModule,
    ActivityModule,
    AuthModule,
    FamiliesModule,
    UploadsModule,
    LocationsModule,
    TagsModule,
    ItemsModule,
    TemplatesModule,
    NotifiersModule,
    NotificationsModule,
    SettingsModule,
    SetupModule,
    ApiKeysModule,
    V1Module,
    DashboardModule,
    SearchModule,
    ScanModule,
  ],
  controllers: [AppController],
  providers: [AppLogger],
  exports: [AppLogger],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    if (env.accessLog) {
      consumer.apply(AccessLogMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
    }
  }
}
