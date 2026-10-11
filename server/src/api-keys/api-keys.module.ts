import { Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyWriteGuard } from './api-key-write.guard';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';

/**
 * API key 模块：管理接口（JWT）+ v1 接口的两个鉴权守卫。
 *
 * 不写 TypeOrmModule.forFeature：DatabaseModule 是 @Global 的，已导出全部实体 Repository。
 */
@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeyGuard, ApiKeyWriteGuard],
  exports: [ApiKeysService, ApiKeyGuard, ApiKeyWriteGuard],
})
export class ApiKeysModule {}
