import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type Repository } from 'typeorm';
import QRCode from 'qrcode';
import { Item } from '../entities/item.entity';
import { ItemUnit } from '../entities/item-unit.entity';
import { Location } from '../entities/location.entity';
import { Template } from '../entities/template.entity';
import { env } from '../config/env';

/** 扫码与二维码服务（职责：把扫码内容解析成实体，以及生成物品/位置的二维码 SVG） */
@Injectable()
export class ScanService {
  constructor(
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(ItemUnit) private readonly units: Repository<ItemUnit>,
    @InjectRepository(Location) private readonly locations: Repository<Location>,
    @InjectRepository(Template) private readonly templates: Repository<Template>,
  ) {}

  /**
   * 扫码解析优先级：
   *   1. 商品条码（EAN/UPC）—— 优先级最高，直接命中物品
   *   2. 系统追溯码（HB-XXXX-XXXX）
   *   3. 模板条码 / 物品二维码 / 位置二维码
   *   4. SN 序列号
   *
   * 各分支都只取响应真正需要的列（select 用对象语法，见 brief 地雷 3），
   * 然后再显式映射成响应体，保证与改造前返回的字段完全一致。
   */
  async resolve(familyId: number, code: string) {
    const byBarcode = await this.items.findOne({
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
    const byTraceCode = await this.items.findOne({
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
    const template = await this.templates.findOne({
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

    const location = await this.locations.findOne({
      where: { familyId, qrToken: code },
      select: { id: true, name: true },
    });
    if (location) {
      return { type: 'location' as const, id: location.id, name: location.name, matchedBy: 'qrcode' as const };
    }

    const item = await this.items.findOne({
      where: { familyId, qrToken: code },
      select: { id: true, name: true },
    });
    if (item) {
      return { type: 'item' as const, id: item.id, name: item.name, matchedBy: 'qrcode' as const };
    }

    // SN 分支要拿物品名，必须加载关系；关系字段的 select 窄化在 TypeORM 没有等价物
    // （会读回整行），所以这里不用 select，改为显式映射（见 brief 地雷 4）
    const unit = await this.units.findOne({
      where: { familyId, sn: code },
      relations: { item: true },
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
    const item = await this.items.findOne({
      where: { id, familyId },
      select: { qrToken: true },
    });
    if (!item) throw new NotFoundException({ code: 'item.notFound', message: '物品不存在' });
    return QRCode.toString(this.payload(item.qrToken), { type: 'svg', margin: 1, width: 256 });
  }

  async locationQr(familyId: number, id: number) {
    const location = await this.locations.findOne({
      where: { id, familyId },
      select: { qrToken: true },
    });
    if (!location) throw new NotFoundException({ code: 'location.notFound', message: '位置不存在' });
    return QRCode.toString(this.payload(location.qrToken), { type: 'svg', margin: 1, width: 256 });
  }
}
