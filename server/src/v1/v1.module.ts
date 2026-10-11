import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AuthModule } from '../auth/auth.module';
import { FamiliesModule } from '../families/families.module';
import { ItemsModule } from '../items/items.module';
import { LocationsModule } from '../locations/locations.module';
import { V1Controller } from './v1.controller';

/**
 * 只读外部 API（`/api/v1/*`）。
 *
 * 复用各业务域的 service，而不是自己写一套查询：软删除过滤、家庭隔离、
 * 对外字段映射都只有一份实现，网页端改了这里自动跟着改。
 */
@Module({
  imports: [AuthModule, FamiliesModule, ItemsModule, LocationsModule, ActivityModule, ApiKeysModule],
  controllers: [V1Controller],
})
export class V1Module {}
