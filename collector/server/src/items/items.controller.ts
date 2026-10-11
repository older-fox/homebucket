import { Controller, Get, Param, Query } from '@nestjs/common';
import { ItemsService } from './items.service';
import { QueryItemsDto } from './dto';

/**
 * 公开只读接口：任何人（含未注册的实例、浏览器、Home Assistant）都能查。
 * 收集器的价值就在于这份资料是公共的，所以读接口一律不鉴权、也不记名。
 */
@Controller('v1')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  /** 关键词/条码搜索（不传 q 就是"最近更新的物品"） */
  @Get('items')
  async search(@Query() query: QueryItemsDto) {
    return this.itemsService.search(query);
  }

  /** 按条码取物品详情（字段值 + 每个字段的来源） */
  @Get('items/:barcode')
  async detail(@Param('barcode') barcode: string) {
    const item = await this.itemsService.findByBarcode(barcode);
    return this.itemsService.detail(item);
  }

  /** 某个物品的上报记录（谁、什么时候、改了哪些字段） */
  @Get('items/:barcode/contributions')
  async contributions(@Param('barcode') barcode: string, @Query() query: QueryItemsDto) {
    const item = await this.itemsService.findByBarcode(barcode);
    return this.itemsService.contributionsOf(item, query);
  }
}
