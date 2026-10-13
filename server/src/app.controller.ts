import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from './database/database.service';
import { SetupStateService } from './setup/setup-state.service';
import { env } from './config/env';

/** 站点级信息与健康检查（无业务逻辑，所以没有独立的 service） */
@Controller()
export class AppController {
  constructor(
    private readonly database: DatabaseService,
    private readonly setupState: SetupStateService,
  ) {}

  /** 服务自述：前端启动时可以据此显示环境与数据库类型 */
  @Get()
  info() {
    return {
      name: 'homebucket-server',
      env: env.nodeEnv,
      // DB_PROVIDER 走 process.env：它是"不进设置的数据库变量"，见 config/env.ts 的说明
      db: process.env.DB_PROVIDER ?? 'mysql',
    };
  }

  /**
   * 前端可见的站点级开关（无需登录）。
   *
   * `needsSetup`：这个实例还没完成首次初始化引导 —— 前端据此把用户送进 /setup。
   * 之所以放在这个**公开**接口上：登录页与引导页都在未登录状态下读它。
   */
  @Get('config')
  config() {
    return {
      allowRegistration: env.allowRegistration && this.setupState.isCompleted,
      needsSetup: !this.setupState.isCompleted,
    };
  }

  @Get('health')
  async health() {
    const db = await this.database.ping();
    return { status: db ? 'ok' : 'degraded', db };
  }
}
