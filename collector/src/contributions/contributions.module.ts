import { Module } from '@nestjs/common';
import { ContributionsController } from './contributions.controller';
import { ContributionsService } from './contributions.service';
import { ItemsModule } from '../items/items.module';
import { InstancesModule } from '../instances/instances.module';

@Module({
  imports: [ItemsModule, InstancesModule],
  controllers: [ContributionsController],
  providers: [ContributionsService],
  // 互操作层（src/compat）要把老契约的匿名上报也走同一条合并路径，所以必须导出
  exports: [ContributionsService],
})
export class ContributionsModule {}
