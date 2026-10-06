import { Controller, Get, Header, Injectable, Module, NotFoundException, Param, ParseIntPipe } from '@nestjs/common';
import QRCode from 'qrcode';
import { CurrentFamily, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import { PrismaService } from '../prisma/prisma.service';
import { env } from '../config/env';

@Injectable()
export class ScanService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 扫码解析优先级：
   *   1. 商品条码（EAN/UPC）—— 优先级最高，直接命中物品
   *   2. 系统追溯码（HB-XXXX-XXXX）
   *   3. 模板条码 / 物品二维码 / 位置二维码
   *   4. SN 序列号
   */
  async resolve(familyId: number, code: string) {
    const byBarcode = await this.prisma.item.findFirst({
      where: { familyId, barcode: code },
      select: { id: true, name: true, barcode: true },
    });
    if (byBarcode) {
      return {
        type: 'item' as const,
        id: byBarcode.id,
        name: byBarcode.name,
        barcode: byBarcode.barcode,
        matchedBy: 'barcode' as const,
      };
    }

    // 追溯码统一大写存储；这里也归一化，避免手输小写时 MySQL/SQLite 行为不一致
    const byTraceCode = await this.prisma.item.findFirst({
      where: { familyId, traceCode: code.trim().toUpperCase() },
      select: { id: true, name: true, traceCode: true },
    });
    if (byTraceCode) {
      return {
        type: 'item' as const,
        id: byTraceCode.id,
        name: byTraceCode.name,
        traceCode: byTraceCode.traceCode,
        matchedBy: 'traceCode' as const,
      };
    }

    // 其次是模板条码：扫码后可直接按模板创建物品
    const template = await this.prisma.template.findFirst({
      where: { familyId, barcode: code },
      select: { id: true, name: true, barcode: true },
    });
    if (template) {
      return {
        type: 'template' as const,
        id: template.id,
        name: template.name,
        barcode: template.barcode,
        matchedBy: 'barcode' as const,
      };
    }

    const location = await this.prisma.location.findFirst({
      where: { familyId, qrToken: code },
      select: { id: true, name: true },
    });
    if (location) {
      return { type: 'location' as const, id: location.id, name: location.name, matchedBy: 'qrcode' as const };
    }

    const item = await this.prisma.item.findFirst({
      where: { familyId, qrToken: code },
      select: { id: true, name: true },
    });
    if (item) {
      return { type: 'item' as const, id: item.id, name: item.name, matchedBy: 'qrcode' as const };
    }

    const unit = await this.prisma.itemUnit.findFirst({
      where: { familyId, sn: code },
      select: { id: true, sn: true, itemId: true, item: { select: { name: true } } },
    });
    if (unit) {
      return {
        type: 'unit' as const,
        id: unit.id,
        itemId: unit.itemId,
        name: unit.item.name,
        sn: unit.sn,
        matchedBy: 'sn' as const,
      };
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
