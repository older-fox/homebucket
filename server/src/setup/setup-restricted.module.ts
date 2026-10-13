import { MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { AppLogger } from '../logger/app.logger';
import { SetupDatabaseController } from './setup-database.controller';
import { SetupProbeBaseController } from './setup-probe-base.controller';
import { SetupProbeController } from './setup-probe.controller';
import { SetupRequiredMiddleware } from './setup-required.middleware';
import { SetupService } from './setup.service';

/**
 * 受限启动的根模块：**连不上数据库**时用它替代 `AppModule`。
 *
 * ── 为什么必须是"另一个根模块"而不是给 AppModule 加条件导入 ──
 * 现有 18 个业务模块的服务全都注入 Repository（连 `AppController` 都注入
 * `DatabaseService`），没有数据源就实例化不了。`@Module` 的 imports 是静态的，
 * 想做条件化只能给每个模块套一层 DynamicModule，代价远大于收益。
 * 这个模块只装三个东西：两个 DB-free 的 setup 接口 + 探活，加上一把总闸中间件。
 *
 * ⚠️ 这里**不能**引入 `DatabaseModule`（TypeOrmModule 会在 init 时连库并抛错，
 * 那就绕回"连不上就起不来"了），也不要引 `ScheduleModule`（没有业务要跑）。
 */
@Module({
  controllers: [SetupDatabaseController, SetupProbeController, SetupProbeBaseController],
  providers: [SetupService, AppLogger],
})
export class SetupRestrictedModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // 全量拦截：白名单以内在控制器里处理，白名单以外一律 503 setup.required
    consumer.apply(SetupRequiredMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
