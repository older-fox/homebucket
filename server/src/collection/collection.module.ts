import { Module } from '@nestjs/common';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';
import { CollectorClient } from './collector-client';
import { CollectorStateService } from './collector-state.service';
import { CollectionSyncService } from './collection-sync.service';
import { UploadsModule } from '../uploads/uploads.module';

/**
 * 条码收集模块（职责：只做 @Module 声明）。
 *
 * 路径与类名保持不变：app.module.ts 与 items.module.ts 都按 '../collection/collection.module'
 * 引入本模块，CollectionService 也必须继续 export —— items 创建/更新物品后会回传条码观测。
 *
 * 不写 TypeOrmModule.forFeature：DatabaseModule 是 @Global 的，已经导出全部实体的 Repository。
 *
 * 引入 UploadsModule 只为读附件字节（上传照片时要拿到原图）。UploadsModule 本身不 import
 * 任何模块，所以 Items → Collection → Uploads 不会成环。
 */
@Module({
  imports: [UploadsModule],
  controllers: [CollectionController],
  providers: [CollectionService, CollectorClient, CollectorStateService, CollectionSyncService],
  exports: [CollectionService, CollectionSyncService],
})
export class CollectionModule {}
