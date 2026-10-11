import { Controller, Get } from '@nestjs/common';
import { CurrentFamily, CurrentUser, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

/** 消息中心入口（职责：只声明路由，聚合逻辑在 NotificationsService） */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /**
   * 取走过久未归位的清单。
   *
   * 家庭维度是清单范围（只能看到当前家庭的物品），阈值是用户维度（自己的提醒设置）。
   */
  @FamilyScoped()
  @Get('overdue')
  overdue(@CurrentFamily() family: FamilyContext, @CurrentUser() user: AuthUser) {
    return this.notifications.overdue(family.id, user.id);
  }
}
