import { Controller, Get, Param, Post } from '@nestjs/common';
import { Authed, CurrentUser } from '../common/decorators';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { FamiliesService } from './families.service';

/** 邀请链接的公开入口：查看邀请信息 / 接受邀请 */
@Controller('invites')
export class InvitesController {
  constructor(private readonly families: FamiliesService) {}

  @Get(':token')
  info(@Param('token') token: string) {
    return this.families.inviteInfo(token);
  }

  @Authed()
  @Post(':token/accept')
  accept(@Param('token') token: string, @CurrentUser() user: AuthUser) {
    return this.families.acceptInvite(token, user.id);
  }
}
