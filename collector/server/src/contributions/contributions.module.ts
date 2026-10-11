import { Module } from '@nestjs/common';
import { ContributionsController } from './contributions.controller';
import { ContributionsService } from './contributions.service';
import { ItemsModule } from '../items/items.module';
import { InstancesModule } from '../instances/instances.module';

@Module({
  imports: [ItemsModule, InstancesModule],
  controllers: [ContributionsController],
  providers: [ContributionsService],
})
export class ContributionsModule {}
