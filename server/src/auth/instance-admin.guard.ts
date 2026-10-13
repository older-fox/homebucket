import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import type { AuthUser } from './jwt-auth.guard';

/**
 * 实例管理员守卫：`/admin/settings` 这类**实例级**（不属于任何家庭）接口用它。
 *
 * ── 为什么不复用家庭角色 ──
 * `FamilyScoped` 那套是"这个家里的物品"，家庭 owner 只能管自己家；
 * 而端口、JWT 密钥、上报地址、注册开关是整个安装的配置，多家庭部署下让任一家庭的
 * owner 去改全局配置是错的。所以另起一个位（`User.isInstanceAdmin`）。
 *
 * ── 为什么每次回库查 ──
 * 不复用 JWT 里的信息（JWT 里也本来就没有这个位）：位子被取消后，旧 token
 * 在有效期内仍能通过校验，缓存进 token 就等于"取消权限要等 7 天生效"。
 */
@Injectable()
export class InstanceAdminGuard implements CanActivate {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException({ code: 'auth.missingToken', message: '缺少登录凭证' });
    }

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user?.isInstanceAdmin) {
      throw new ForbiddenException({ code: 'settings.adminOnly', message: '仅实例管理员可访问' });
    }

    return true;
  }
}
