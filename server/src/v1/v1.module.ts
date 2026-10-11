import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AuthModule } from '../auth/auth.module';
import { FamiliesModule } from '../families/families.module';
import { ItemsModule } from '../items/items.module';
import { LocationsModule } from '../locations/locations.module';
import { ScanModule } from '../scan/scan.module';
import { V1Controller } from './v1.controller';
import { V1WriteController } from './v1-write.controller';

/**
 * 外部 API（`/api/v1/*`）：只读控制器 + 可写物品的写控制器。
 *
 * 复用各业务域的 service，而不是自己写一套查询：软删除过滤、家庭隔离、
 * 对外字段映射都只有一份实现，网页端改了这里自动跟着改。
 * 写侧另外需要 ScanService（取走/归还按码解析），所以也要引入 ScanModule。
 */
@Module({
  imports: [
    AuthModule,
    FamiliesModule,
    ItemsModule,
    LocationsModule,
    ActivityModule,
    ScanModule,
    ApiKeysModule,
  ],
  controllers: [V1Controller, V1WriteController],
})
export class V1Module {}
