import { Module } from '@nestjs/common';
import { CompatController } from './compat.controller';
import { CompatService } from './compat.service';
import { ItemsModule } from '../items/items.module';
import { ContributionsModule } from '../contributions/contributions.module';

/**
 * 互操作层：只服务于"已经部署出去、不会升级"的 HomeBucket 实例客户端。
 * 与 v1 模块共用同一套读侧（ItemsService）与写侧（ContributionsService），
 * 所以两条协议看到的是同一份资料，不存在两套真相。
 */
@Module({
  imports: [ItemsModule, ContributionsModule],
  controllers: [CompatController],
  providers: [CompatService],
})
export class CompatModule {}
