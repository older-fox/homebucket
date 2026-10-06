import { Controller, Get, Header, Param, ParseIntPipe } from '@nestjs/common';
import { CurrentFamily, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
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
