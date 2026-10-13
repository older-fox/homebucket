import { Body, Controller, ForbiddenException, HttpCode, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { RegisterDto } from '../auth/dto/auth.dto';
import { SetupStateService } from './setup-state.service';

/**
 * 引导第 2 步：创建第一个账号（实例管理员）。
 *
 * 为什么不是直接复用 `POST /api/auth/register`：那条路**不会**给 `isInstanceAdmin`
 * （普通注册的账号不该管全局配置），而且它受 `ALLOW_REGISTRATION` 开关约束 ——
 * 引导必须能在"关闭注册"的实例上跑完。
 *
 * 安全性靠"库里必须一个用户都没有"来保证（见 `AuthService.createInitialAdmin`），
 * 所以这个接口不需要登录态：那一刻还没有任何账号可登录。引导完成后它自动失效
 * （已完成 + 已有用户，两道都会拦）。
 */
@Controller('setup/admin')
export class SetupAdminController {
  constructor(
    private readonly auth: AuthService,
    private readonly state: SetupStateService,
  ) {}

  /** 建号并直接返回会话（自动登录），引导第 3/4 步就用这个 token 调实例设置接口 */
  @Post()
  @HttpCode(200)
  async create(@Body() dto: RegisterDto) {
    if (this.state.isCompleted) {
      throw new ForbiddenException({ code: 'setup.alreadyCompleted', message: '该实例已完成初始化' });
    }

    return this.auth.createInitialAdmin(dto);
  }
}
