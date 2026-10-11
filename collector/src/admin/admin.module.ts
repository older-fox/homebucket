import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminTokenGuard } from './admin-token.guard';
import { ItemsModule } from '../items/items.module';
import { InstancesModule } from '../instances/instances.module';

@Module({
  imports: [ItemsModule, InstancesModule],
  controllers: [AdminController],
  providers: [AdminService, AdminTokenGuard],
})
export class AdminModule {}
