import { Controller, Get } from '@nestjs/common';
import { SetupService, type DatabaseSummary } from './setup.service';

/**
 * 受限启动（连不上库）时的 `/setup/status`。
 *
 * 正常模式下这个路由由 `SetupStatusController` 提供（那个要查库）。两个控制器分属两个
 * 根模块，一次只加载一个，所以同名路由不冲突。
 */
@Controller('setup')
export class SetupProbeController {
  constructor(private readonly setup: SetupService) {}

  /**
   * 受限模式下答案其实是恒定的（"需要初始化"），但仍然把**探测到的连接参数**回给界面：
   * 引导页第 1 步要用它预填表单，用户只需要改错的那一项，不用从零填。
   */
  @Get('status')
  status(): { needsSetup: true; databaseAvailable: false; database: DatabaseSummary } {
    return { needsSetup: true, databaseAvailable: false, database: this.setup.summary() };
  }
}
