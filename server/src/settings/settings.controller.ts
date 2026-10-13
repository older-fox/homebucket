import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser, InstanceAdmin } from '../common/decorators';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { UpdateSettingsDto } from './dto';
import { SettingsService, type SettingsView } from './settings.service';

/**
 * 实例设置（原 `.env` 里除数据库之外的配置）。
 *
 * 路径挂在 `admin/` 下与其它管理端接口同前缀；路由前缀由 `main.ts` 的
 * `setGlobalPrefix(env.apiPrefix)` 补上，所以最终是 `/api/admin/settings`。
 *
 * 只读也是管理员权限：这些项里有端口、JWT 密钥、S3 凭据、上报地址，
 * 普通成员没有理由看到。
 */
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** 全量配置 + 每项来源/是否待重启（一次拿完，界面按 group 分组渲染） */
  @Get()
  @InstanceAdmin()
  list(): Promise<SettingsView> {
    return this.settings.list();
  }

  /** 保存一批；返回保存后的完整视图，前端一次往返就能刷新"待重启"等状态 */
  @Patch()
  @InstanceAdmin()
  update(@Body() dto: UpdateSettingsDto, @CurrentUser() user: AuthUser): Promise<SettingsView> {
    return this.settings.update(dto.values, user.id);
  }
}
