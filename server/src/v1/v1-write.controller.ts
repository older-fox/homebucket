import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentFamily, CurrentUser } from '../common/decorators';
import { FamilyContextGuard, type FamilyContext } from '../common/family-context.guard';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { actorOf } from '../activity/activity.service';
import { ItemsService } from '../items/items.service';
import {
  AdjustStockDto,
  CreateItemDto,
  ItemUnitDto,
  UnpackDto,
  UpdateItemDto,
} from '../items/dto';
import { ScanService } from '../scan/scan.service';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { ApiKeyWriteGuard } from '../api-keys/api-key-write.guard';

/**
 * 可写物品的 v1 接口（`/api/v1/*` 的写侧），只对 `scope: 'write'` 的 key 开放。
 *
 * ── 约定 ──
 *
 * 1. **写在单独的控制器里**：只读控制器（v1.controller.ts）继续只有 GET，
 *    "只读控制器里不许出现写路由"这条护栏才能一直成立。这里也只允许
 *    `ApiKeyGuard + ApiKeyWriteGuard`，两条一起挂（顺序不能反，见 write guard 注释）。
 * 2. **所有路由都是家庭级**：逐个挂 `FamilyContextGuard`（`x-family-id` 选择家庭），
 *    与只读侧一致；写操作一律带 `actorOf(user)` 记进操作历史，网页端能看到是谁改的。
 * 3. **不新写查询**：全部转调 ItemsService / ScanService —— 软删除过滤、条码/SN 唯一性、
 *    包装换算、历史留痕都只有一份实现。
 * 4. **动作型接口用 POST 且显式 200**：取走/归还没有创建任何资源，
 *    返回的只是动作之后的状态（与网页端 `scan/:code/take` 完全一致）。
 */
@Controller('v1')
@UseGuards(ApiKeyGuard, ApiKeyWriteGuard)
export class V1WriteController {
  constructor(
    private readonly items: ItemsService,
    private readonly scan: ScanService,
  ) {}

  /** 生成家庭内唯一的系统追溯码（物品没有厂家条码时用）；创建后不可修改 */
  @Post('items/trace-code')
  @UseGuards(FamilyContextGuard)
  @HttpCode(HttpStatus.OK)
  async mintTraceCode(@CurrentFamily() family: FamilyContext) {
    return { traceCode: await this.items.mintTraceCode(family.id) };
  }

  /** 新建物品；请求体与网页端 `POST /items` 同一套 DTO */
  @Post('items')
  @UseGuards(FamilyContextGuard)
  create(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateItemDto,
  ) {
    return this.items.create(family.id, actorOf(user), dto);
  }

  /**
   * 改已有物品的属性（部分更新：只传要改的字段）。
   * 与网页端 `PATCH /items/:id` 同一个 UpdateItemDto —— 名称、描述、数量、价格、型号、
   * 厂商、条码、位置、标签、图片、包装层级都在内；追溯码故意不在（创建后不可变）。
   */
  @Patch('items/:id')
  @UseGuards(FamilyContextGuard)
  update(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateItemDto,
  ) {
    return this.items.update(family.id, actorOf(user), id, dto);
  }

  /** 删除物品：软删除（保留行以维持条码/SN 唯一槽位与历史），之后读接口看不到 */
  @Delete('items/:id')
  @UseGuards(FamilyContextGuard)
  remove(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.items.remove(family.id, actorOf(user), id);
  }

  // ---------- 遗失标记 ----------

  @Post('items/:id/lost')
  @UseGuards(FamilyContextGuard)
  markLost(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.items.markLost(family.id, actorOf(user), id);
  }

  /** 取消遗失标记（东西又找到了） */
  @Delete('items/:id/lost')
  @UseGuards(FamilyContextGuard)
  markFound(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.items.markFound(family.id, actorOf(user), id);
  }

  // ---------- 序列号（SN）新增 / 修改 / 删除 ----------
  // 遗失标记那两条必须排在 :unitId 之前，否则 lost 会被 ParseIntPipe 当成 unitId

  @Post('items/:id/units/:unitId/lost')
  @UseGuards(FamilyContextGuard)
  markUnitLost(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('unitId', ParseIntPipe) unitId: number,
  ) {
    return this.items.markUnitLost(family.id, actorOf(user), id, unitId);
  }

  @Delete('items/:id/units/:unitId/lost')
  @UseGuards(FamilyContextGuard)
  markUnitFound(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('unitId', ParseIntPipe) unitId: number,
  ) {
    return this.items.markUnitFound(family.id, actorOf(user), id, unitId);
  }

  @Post('items/:id/units')
  @UseGuards(FamilyContextGuard)
  addUnit(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ItemUnitDto,
  ) {
    return this.items.addUnit(family.id, actorOf(user), id, dto);
  }

  @Patch('items/:id/units/:unitId')
  @UseGuards(FamilyContextGuard)
  updateUnit(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('unitId', ParseIntPipe) unitId: number,
    @Body() dto: ItemUnitDto,
  ) {
    return this.items.updateUnit(family.id, actorOf(user), id, unitId, dto);
  }

  @Delete('items/:id/units/:unitId')
  @UseGuards(FamilyContextGuard)
  removeUnit(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('unitId', ParseIntPipe) unitId: number,
  ) {
    return this.items.removeUnit(family.id, actorOf(user), id, unitId);
  }

  // ---------- 库存动作：消耗 / 补货 / 拆箱 ----------

  @Post('items/:id/consume')
  @UseGuards(FamilyContextGuard)
  consume(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdjustStockDto,
  ) {
    return this.items.consume(family.id, actorOf(user), id, dto);
  }

  @Post('items/:id/restock')
  @UseGuards(FamilyContextGuard)
  restock(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdjustStockDto,
  ) {
    return this.items.restock(family.id, actorOf(user), id, dto);
  }

  @Post('items/:id/unpack')
  @UseGuards(FamilyContextGuard)
  unpack(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UnpackDto,
  ) {
    return this.items.unpack(family.id, actorOf(user), id, dto);
  }

  // ---------- 取走 / 归还（按码，不是按 id） ----------

  /**
   * 取走：`code` 可以是条码、追溯码、二维码 token 或 SN —— 与网页端扫码同一套解析，
   * 因为它们最终都走 ScanService.setTakenOut。
   */
  @Post('scan/:code/take')
  @UseGuards(FamilyContextGuard)
  @HttpCode(HttpStatus.OK)
  take(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
  ) {
    return this.scan.setTakenOut(family.id, actorOf(user), code, true);
  }

  /** 归还（放回原位） */
  @Post('scan/:code/return')
  @UseGuards(FamilyContextGuard)
  @HttpCode(HttpStatus.OK)
  putBack(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
  ) {
    return this.scan.setTakenOut(family.id, actorOf(user), code, false);
  }
}
