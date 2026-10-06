import { Module } from '@nestjs/common';
import { CollectionController } from './collection.controller';
import { CollectionService } from './collection.service';

/**
 * 条码收集模块（职责：只做 @Module 声明）。
 *
 * 路径与类名保持不变：app.module.ts 与 items.module.ts 都按 '../collection/collection.module'
 * 引入本模块，CollectionService 也必须继续 export —— items 创建/更新物品后会回传条码观测。
 *
 * 不写 TypeOrmModule.forFeature：DatabaseModule 是 @Global 的，已经导出全部实体的 Repository。
 */
@Module({
  controllers: [CollectionController],
  providers: [CollectionService],
  exports: [CollectionService],
})
export class CollectionModule {}
