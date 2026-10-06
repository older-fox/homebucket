import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { entities } from '../entities';
import { buildDataSourceOptions } from './data-source';
import { DatabaseService } from './database.service';

/**
 * 数据库模块（全局）。
 *
 * 用 forRootAsync + useFactory 而不是直接 forRoot，是为了让连接参数在
 * 模块初始化时才求值 —— env 的 getter 是惰性读 process.env 的，
 * 而 main.ts 里 dotenv 的加载时机比 ES import 提升要晚。
 *
 * autoLoadEntities 保持关闭：实体清单在 entities/index.ts 里显式维护，
 * 这样迁移脚本（CLI）与运行期用的是同一份清单，不会出现"CLI 看不到某个实体"的漂移。
 *
 * 这里顺手把 `forFeature(entities)` 也注册并导出：因为本模块是 @Global 的，
 * 业务模块可以直接 @InjectRepository(Xxx) 而不必每个模块各写一遍 forFeature 清单
 * （14 个模块重复同一份实体列表既啰嗦又容易漏）。
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        ...buildDataSourceOptions(),
        autoLoadEntities: false,
      }),
    }),
    TypeOrmModule.forFeature(entities),
  ],
  providers: [DatabaseService],
  exports: [DatabaseService, TypeOrmModule],
})
export class DatabaseModule {}
