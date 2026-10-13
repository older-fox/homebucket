import { BadRequestException, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { InstanceAdmin } from '../common/decorators';
import { SetupService, type DatabaseSummary } from './setup.service';
import { SetupStateService } from './setup-state.service';

/**
 * 正常模式（库已连上）下的引导接口。
 *
 * 只有两个职责：告诉前端"还差引导"，以及把引导收尾（写完成标记）。
 * 中间那些设置项走已有的 `/api/admin/settings`，不另造一套写接口 —— 少一套就不用
 * 维护两套校验与多语言文案。
 */
@Controller('setup')
export class SetupStatusController {
  constructor(
    private readonly setup: SetupService,
    private readonly state: SetupStateService,
  ) {}

  @Get('status')
  status(): { needsSetup: boolean; databaseAvailable: true; database: DatabaseSummary } {
    return {
      needsSetup: !this.state.isCompleted,
      databaseAvailable: true,
      database: this.setup.summary(),
    };
  }

  /**
   * 收尾：写下"初始化完成"。需要实例管理员 —— 此时第 2 步刚建的账号已经登录并持有它。
   * 完成之后 `/setup` 与全部 setup 接口都不再可用（见 SetupGateGuard 的白名单判断）。
   */
  @Post('finish')
  @HttpCode(200)
  @InstanceAdmin()
  async finish(): Promise<{ ok: true }> {
    if (this.state.isCompleted) {
      throw new BadRequestException({ code: 'setup.alreadyCompleted', message: '该实例已完成初始化' });
    }

    await this.state.markCompleted();
    return { ok: true };
  }
}
