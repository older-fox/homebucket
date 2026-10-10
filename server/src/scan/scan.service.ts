import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type Repository } from 'typeorm';
import QRCode from 'qrcode';
import { Item } from '../entities/item.entity';
import { ItemUnit } from '../entities/item-unit.entity';
import { Location } from '../entities/location.entity';
import { Template } from '../entities/template.entity';
import { Attachment } from '../entities/attachment.entity';
import { mediaUrl } from '../common/media';
import { env } from '../config/env';

/**
 * 扫码浮窗要展示的卡片信息。
 *
 * 放在解析结果里一起返回，而不是让前端再查一次物品详情：扫码是"举着码枪点一下"的动作，
 * 多一次往返就多一次卡顿，而且解析本身已经知道命中的是哪个对象了。
 */
export interface ScanCard {
  name: string;
  /** 型号 / 制造商（或 SN 备注）拼出的副标题，都没有时为 null */
  subtitle: string | null;
  quantity: number | null;
  price: number | null;
  locationName: string | null;
  imageUrl: string | null;
  traceCode: string | null;
  barcode: string | null;
  sn: string | null;
  /** 该物品登记了几个 SN（0 = 不按件追踪）；位置与模板结果为 null */
  unitCount: number | null;
}

/**
 * 扫码解析结果。
 *
 * type/id/name/matchedBy 等字段与改造前**完全一致**（前端扫码页在用），
 * 新增的只有 `takenOutAt` 与 `card`，属于增量。
 */
export interface ScanTarget {
  type: 'item' | 'unit' | 'template' | 'location';
  id: number;
  itemId?: number;
  name: string;
  barcode?: string | null;
  traceCode?: string | null;
  sn?: string | null;
  matchedBy: 'barcode' | 'traceCode' | 'qrcode' | 'sn';
  /** 非空 = 当前处于「已拿走使用」状态；位置与模板恒为 null */
  takenOutAt: Date | null;
  card: ScanCard;
}

/** 型号 · 制造商，两者都空时返回 null */
function subtitleOf(item: Item): string | null {
  const parts = [item.model, item.manufacturer].filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** 扫码与二维码服务（职责：把扫码内容解析成实体，以及生成物品/位置的二维码 SVG） */
@Injectable()
export class ScanService {
  constructor(
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(ItemUnit) private readonly units: Repository<ItemUnit>,
    @InjectRepository(Location) private readonly locations: Repository<Location>,
    @InjectRepository(Template) private readonly templates: Repository<Template>,
    @InjectRepository(Attachment) private readonly attachments: Repository<Attachment>,
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
  async resolve(familyId: number, code: string): Promise<ScanTarget> {
    const target = await this.findTarget(familyId, code);
    if (!target) {
      throw new NotFoundException({ code: 'scan.notFound', message: '没有找到对应的物品或位置' });
    }
    return target;
  }

  /**
   * 「取走 / 放回」：把码解析到的对象（整件物品，或某一条 SN）标记状态。
   *
   * 只解析一次：findTarget 已经把目标连同卡片一起拿回来了，改完直接把新状态回填，
   * 不必为了拿最新状态再跑一遍六次查询。
   */
  async setTakenOut(familyId: number, code: string, takenOut: boolean): Promise<ScanTarget> {
    const target = await this.findTarget(familyId, code);
    if (!target) {
      throw new NotFoundException({ code: 'scan.notFound', message: '没有找到对应的物品或位置' });
    }
    if (target.type !== 'item' && target.type !== 'unit') {
      throw new BadRequestException({
        code: 'scan.notTakeable',
        message: target.type === 'location' ? '位置不能取走' : '模板不能取走',
      });
    }

    const takenOutAt = takenOut ? new Date() : null;
    if (target.type === 'unit') {
      await this.units.update({ id: target.id, familyId }, { takenOutAt });
    } else {
      await this.items.update({ id: target.id, familyId }, { takenOutAt });
    }

    return { ...target, takenOutAt };
  }

  /** 解析成目标实体；查不到返回 null（由调用方决定是 404 还是别的处理） */
  private async findTarget(familyId: number, code: string): Promise<ScanTarget | null> {
    const itemColumns = {
      id: true,
      name: true,
      barcode: true,
      traceCode: true,
      quantity: true,
      price: true,
      model: true,
      manufacturer: true,
      takenOutAt: true,
      locationId: true,
      coverImageId: true,
    } as const;

    const byBarcode = await this.items.findOne({
      where: { familyId, barcode: code },
      select: itemColumns,
    });
    if (byBarcode) return this.itemTarget(familyId, byBarcode, 'barcode');

    // 追溯码统一大写存储；这里也归一化，避免手输小写时 MySQL/SQLite 行为不一致
    const byTraceCode = await this.items.findOne({
      where: { familyId, traceCode: code.trim().toUpperCase() },
      select: itemColumns,
    });
    if (byTraceCode) return this.itemTarget(familyId, byTraceCode, 'traceCode');

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
        takenOutAt: null,
        card: {
          name: template.name,
          subtitle: null,
          quantity: null,
          price: null,
          locationName: null,
          imageUrl: null,
          traceCode: null,
          barcode: template.barcode,
          sn: null,
          unitCount: null,
        },
      };
    }

    const location = await this.locations.findOne({
      where: { familyId, qrToken: code },
      select: { id: true, name: true },
    });
    if (location) {
      return {
        type: 'location' as const,
        id: location.id,
        name: location.name,
        matchedBy: 'qrcode' as const,
        takenOutAt: null,
        card: {
          name: location.name,
          subtitle: null,
          quantity: null,
          price: null,
          locationName: location.name,
          imageUrl: null,
          traceCode: null,
          barcode: null,
          sn: null,
          unitCount: null,
        },
      };
    }

    const item = await this.items.findOne({
      where: { familyId, qrToken: code },
      select: itemColumns,
    });
    if (item) return this.itemTarget(familyId, item, 'qrcode');

    // SN 分支要拿物品名，必须加载关系；关系字段的 select 窄化在 TypeORM 没有等价物
    // （会读回整行），所以这里不用 select，改为显式映射（见 brief 地雷 4）
    const unit = await this.units.findOne({
      where: { familyId, sn: code },
      relations: { item: true },
    });
    if (unit) return this.unitTarget(familyId, unit);

    return null;
  }

  /** 物品级目标：位置取物品自身的位置，SN 数用来提示"这件是分件管理的" */
  private async itemTarget(
    familyId: number,
    item: Item,
    matchedBy: 'barcode' | 'traceCode' | 'qrcode',
  ): Promise<ScanTarget> {
    const [locationName, imageUrl, unitCount] = await Promise.all([
      this.locationName(familyId, item.locationId),
      this.imageUrl(familyId, item.coverImageId),
      this.units.count({ where: { familyId, itemId: item.id } }),
    ]);

    return {
      type: 'item',
      id: item.id,
      name: item.name,
      barcode: item.barcode,
      traceCode: item.traceCode,
      matchedBy,
      takenOutAt: item.takenOutAt,
      card: {
        name: item.name,
        subtitle: subtitleOf(item),
        quantity: item.quantity,
        price: item.price,
        locationName,
        imageUrl,
        traceCode: item.traceCode,
        barcode: item.barcode,
        sn: null,
        unitCount,
      },
    };
  }

  /**
   * SN 级目标。位置取**这一件自己的**位置：同款三台风扇可能各在不同房间，
   * 用物品的位置会说谎。封面图仍用物品的，SN 自己没有图。
   */
  private async unitTarget(familyId: number, unit: ItemUnit): Promise<ScanTarget> {
    const [locationName, imageUrl, unitCount] = await Promise.all([
      this.locationName(familyId, unit.locationId),
      this.imageUrl(familyId, unit.item.coverImageId),
      this.units.count({ where: { familyId, itemId: unit.itemId } }),
    ]);

    return {
      type: 'unit',
      id: unit.id,
      itemId: unit.itemId,
      name: unit.item.name,
      sn: unit.sn,
      matchedBy: 'sn',
      takenOutAt: unit.takenOutAt,
      card: {
        name: unit.item.name,
        subtitle: unit.note ?? subtitleOf(unit.item),
        quantity: null,
        price: unit.item.price,
        locationName,
        imageUrl,
        traceCode: unit.item.traceCode,
        barcode: unit.item.barcode,
        sn: unit.sn,
        unitCount,
      },
    };
  }

  /** 位置名（浮窗要回答"现在在哪"）。没有 locationId 就直接返回 null，省掉一次无谓查询 */
  private async locationName(familyId: number, locationId: number | null): Promise<string | null> {
    if (!locationId) return null;
    const location = await this.locations.findOne({
      where: { id: locationId, familyId },
      select: { name: true },
    });
    return location?.name ?? null;
  }

  /** 封面图地址；同样在没有图时省掉查询 */
  private async imageUrl(familyId: number, coverImageId: number | null): Promise<string | null> {
    if (!coverImageId) return null;
    const attachment = await this.attachments.findOne({
      where: { id: coverImageId, familyId },
      select: { key: true, url: true },
    });
    return mediaUrl(attachment);
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
