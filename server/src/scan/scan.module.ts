import { Controller, Get, Header, Injectable, Module, NotFoundException, Param, ParseIntPipe } from '@nestjs/common';
import QRCode from 'qrcode';
import { CurrentFamily, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import { PrismaService } from '../prisma/prisma.service';
import { env } from '../config/env';

@Injectable()
export class ScanService {
  constructor(private readonly prisma: PrismaService) {}

  /** 扫码落地：先按位置二维码、再按物品二维码、最后按 SN 反查 */
  async resolve(familyId: number, code: string) {
    const location = await this.prisma.location.findFirst({
      where: { familyId, qrToken: code },
      select: { id: true, name: true },
    });
    if (location) return { type: 'location' as const, id: location.id, name: location.name };

    const item = await this.prisma.item.findFirst({
      where: { familyId, qrToken: code },
      select: { id: true, name: true },
    });
    if (item) return { type: 'item' as const, id: item.id, name: item.name };

    const unit = await this.prisma.itemUnit.findFirst({
      where: { familyId, sn: code },
      select: { id: true, sn: true, itemId: true, item: { select: { name: true } } },
    });
    if (unit) {
      return { type: 'unit' as const, id: unit.id, itemId: unit.itemId, name: unit.item.name, sn: unit.sn };
    }

    throw new NotFoundException({ code: 'scan.notFound', message: '没有找到对应的物品或位置' });
  }

  /** 二维码内容：配置了 PUBLIC_BASE_URL 就用完整链接，手机扫码可直接打开 */
  private payload(token: string) {
    return env.publicBaseUrl ? `${env.publicBaseUrl}/r/${token}` : token;
  }

  async itemQr(familyId: number, id: number) {
    const item = await this.prisma.item.findFirst({
      where: { id, familyId },
      select: { qrToken: true },
    });
    if (!item) throw new NotFoundException({ code: 'item.notFound', message: '物品不存在' });
    return QRCode.toString(this.payload(item.qrToken), { type: 'svg', margin: 1, width: 256 });
  }

  async locationQr(familyId: number, id: number) {
    const location = await this.prisma.location.findFirst({
      where: { id, familyId },
      select: { qrToken: true },
    });
    if (!location) throw new NotFoundException({ code: 'location.notFound', message: '位置不存在' });
    return QRCode.toString(this.payload(location.qrToken), { type: 'svg', margin: 1, width: 256 });
  }
}

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

@Module({
  controllers: [ScanController],
  providers: [ScanService],
})
export class ScanModule {}
