import { Controller, Get, Param } from '@nestjs/common';
import { CurrentFamily, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import { env } from '../config/env';
import { CollectionService } from './collection.service';

/** 条码查询入口（职责：只做参数与家庭上下文的编排，数据访问都在 CollectionService） */
@Controller('barcodes')
export class CollectionController {
  constructor(private readonly collection: CollectionService) {}

  /**
   * 条码查询：先看本家庭是否已有该条码的物品，再向收集服务要一份"商品真实信息"。
   * 前端据此决定是「直接打开已有物品」还是「用远端信息预填新建表单」。
   */
  @FamilyScoped()
  @Get(':code/lookup')
  async lookup(@CurrentFamily() family: FamilyContext, @Param('code') code: string) {
    const barcode = code.trim();
    const [local, remote, template] = await Promise.all([
      this.collection.local(family.id, barcode),
      this.collection.lookup(barcode),
      this.collection.template(family.id, barcode),
    ]);

    return {
      barcode,
      local,
      /** 命中模板时前端会自动套用（用于「扫码快速填充模板」） */
      template,
      remote,
      /** 收集功能是否可用（前端可据此提示"条码库未启用"） */
      collectionEnabled: env.dataCollectionEnabled,
      collectionAvailable: !!env.dataCollectionEndpoint && !!remote,
    };
  }
}
