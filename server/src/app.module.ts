import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
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
import { DatabaseModule } from './database/database.module';
import { ScanModule } from './scan/scan.module';
import { SearchModule } from './search/search.module';
import { TagsModule } from './tags/tags.module';
import { TemplatesModule } from './templates/templates.module';
import { UploadsModule } from './uploads/uploads.module';
import { env } from './config/env';

@Module({
  imports: [
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
