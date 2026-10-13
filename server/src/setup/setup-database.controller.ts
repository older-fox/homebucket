import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { DatabaseConfigDto } from './dto';
import { SETUP_RESTART_EXIT_CODE } from './setup-paths';
import { SetupService } from './setup.service';

/**
 * 数据库连接的测试与落盘。
 *
 * **不注入任何 Repository**：这个控制器在"连不上库"的受限启动模式下也要能用
 * （那正是它存在的意义），所以它被受限模块与正常模块**同时**引用 —— 两个根模块
 * 一次只会加载一个，不会路由冲突。
 *
 * 两个 POST 都显式 200：Nest 的 POST 默认是 201，但这两个都不是"创建了资源"
 * （测试连接不落任何东西，保存返回的是"接下来要重启"），用 201 会让前端与文档都别扭。
 */
@Controller('setup/database')
export class SetupDatabaseController {
  constructor(private readonly setup: SetupService) {}

  /** 试连一次（失败会带底层原因，见 SetupService.testConnection） */
  @Post('test')
  @HttpCode(200)
  async test(@Body() dto: DatabaseConfigDto): Promise<{ ok: true }> {
    await this.setup.testConnection(this.setup.normalize(dto));
    return { ok: true };
  }

  /**
   * 保存连接参数。
   *
   * 连接参数只能在**启动期**读到（要连上库才能读库里的配置，先有鸡还是先有蛋），
   * 所以这里写完 `/data/db.config.json` 就退出进程，由 `docker-entrypoint.sh` 按新配置
   * 把后端重启起来（退出码见 setup-paths.ts）。前端会看到接口短暂不可用并轮询状态。
   *
   * 延迟 200ms 再退出是为了让响应先发出去 —— 否则浏览器拿到的是一个断开的连接，
   * 引导页就没法显示"正在按新配置重启"。
   */
  @Post()
  @HttpCode(200)
  save(@Body() dto: DatabaseConfigDto): { ok: true; restarting: true; path: string } {
    const input = this.setup.normalize(dto);
    const path = this.setup.writeDatabaseConfig(input);

    setTimeout(() => process.exit(SETUP_RESTART_EXIT_CODE), 200);

    return { ok: true, restarting: true, path };
  }
}
