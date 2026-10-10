import { Controller, Get, Header, HttpCode, HttpStatus, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CurrentFamily, CurrentUser, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { actorOf } from '../activity/activity.service';
import { ScanService } from './scan.service';

/** 扫码/二维码入口（职责：只声明路由与响应头，解析逻辑在 ScanService） */
@Controller()
export class ScanController {
  constructor(private readonly scan: ScanService) {}

  @FamilyScoped()
  @Get('scan/:code')
  resolve(@CurrentFamily() family: FamilyContext, @Param('code') code: string) {
    return this.scan.resolve(family.id, code);
  }

  /**
   * 取走 / 放回用 POST 而不是 PATCH：这不是"改物品的某个字段"，
   * 而是"针对这个码执行一次动作"，响应体带回动作后的完整目标状态。
   *
   * 显式声明 200：@Post 默认 201 Created，但这里没有创建任何资源，
   * 返回的只是动作之后的当前状态。
   */
  @FamilyScoped()
  @Post('scan/:code/take')
  @HttpCode(HttpStatus.OK)
  take(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
  ) {
    return this.scan.setTakenOut(family.id, actorOf(user), code, true);
  }

  @FamilyScoped()
  @Post('scan/:code/return')
  @HttpCode(HttpStatus.OK)
  putBack(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
  ) {
    return this.scan.setTakenOut(family.id, actorOf(user), code, false);
  }

  @FamilyScoped()
  @Get('items/:id/qrcode.svg')
  @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  itemQr(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.scan.itemQr(family.id, id);
  }

  @FamilyScoped()
  @Get('locations/:id/qrcode.svg')
  @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  locationQr(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.scan.locationQr(family.id, id);
  }
}
