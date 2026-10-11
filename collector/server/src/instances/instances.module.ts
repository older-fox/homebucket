import { Module } from '@nestjs/common';
import { InstancesController } from './instances.controller';
import { InstancesService } from './instances.service';
import { InstanceKeyGuard } from './instance-key.guard';

@Module({
  controllers: [InstancesController],
  providers: [InstancesService, InstanceKeyGuard],
  exports: [InstancesService, InstanceKeyGuard],
})
export class InstancesModule {}
