import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './database/data-source';
import { SqlitePragmas } from './database/pragmas';
import { FixedWindowRateLimiter } from './common/rate-limit';
import { RATE_LIMITER, RateLimitGuard } from './common/rate-limit.guard';
import { env } from './config/env';
import { ItemsModule } from './items/items.module';
import { ContributionsModule } from './contributions/contributions.module';
import { InstancesModule } from './instances/instances.module';
import { AdminModule } from './admin/admin.module';
import { StatsModule } from './stats/stats.module';
import { HealthModule } from './health/health.module';
import { CompatModule } from './compat/compat.module';

/**
 * 应用装配。
 *
 * 只有一处全局守卫（限流）与一条全局管道（校验，在 app.factory 里装）：
 * 鉴权刻意不做成全局 —— 公开读接口本来就不该带任何身份，
 * 把"哪些路由需要什么身份"写在各自控制器上，比在全局守卫里维护一张白名单清楚得多。
 * 数据访问统一用 DataSource（而不是每个模块 forFeature 注入 Repository），
 * 这样所有写路径都能自然地包进同一个事务里。
 */
@Module({
  imports: [
    TypeOrmModule.forRoot(buildDataSourceOptions() as TypeOrmModuleOptions),
    ItemsModule,
    ContributionsModule,
    InstancesModule,
    AdminModule,
    StatsModule,
    HealthModule,
    // 互操作层放在最后：它只是"老客户端契约"的适配器，不参与自己的 v1 协议
    CompatModule,
  ],
  providers: [
    SqlitePragmas,
    {
      provide: RATE_LIMITER,
      useFactory: () => new FixedWindowRateLimiter(env.rateLimit, env.rateWindowMs),
    },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
