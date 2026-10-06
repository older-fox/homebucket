import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';

/**
 * 位置域的模块声明（只放 @Module，业务逻辑见 locations.service.ts）。
 *
 * 路径与类名保持不变，app.module.ts 仍按 ./locations/locations.module 引入。
 * 不需要 TypeOrmModule.forFeature：DatabaseModule 是 @Global 的，已导出全部实体的 Repository。
 */
@Module({
  controllers: [LocationsController],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
