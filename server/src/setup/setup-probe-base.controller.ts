import { Controller, Get } from '@nestjs/common';

/**
 * 受限启动时替代 `AppController` 的两个探针接口。
 *
 * `AppController` 注入了 `DatabaseService`（→ `DataSource`），没有库就实例化不了，
 * 所以受限模式下必须由它顶上：容器探活（`/api/health`）与前端判断"要不要进引导"
 * （`/api/config`）都不能因为没有库而失效 —— 否则容器会一直显示不健康，
 * 而用户连引导页都打不开。
 */
@Controller()
export class SetupProbeBaseController {
  /** 契约与正常模式一致（status/db），只是必然没有库 */
  @Get('health')
  health(): { status: string; db: boolean } {
    return { status: 'degraded', db: false };
  }

  @Get('config')
  config(): { allowRegistration: boolean; needsSetup: boolean } {
    // 还没初始化时不可能开放注册：连管理员都还不存在，注册入口只会被门禁拦下
    return { allowRegistration: false, needsSetup: true };
  }
}
