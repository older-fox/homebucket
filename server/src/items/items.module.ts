import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { CollectionModule } from '../collection/collection.module';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';

@Module({
  imports: [CollectionModule, ActivityModule],
  controllers: [ItemsController],
  providers: [ItemsService],
  exports: [ItemsService],
})
export class ItemsModule {}
