import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentFamily, CurrentUser, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { ActivityService, type ActivityActor } from '../activity/activity.service';
import { ActivityQueryDto } from '../activity/dto';
import { ItemsService } from './items.service';
import { CreateItemDto, AdjustStockDto, ItemUnitDto, QueryItemsDto, UnpackDto, UpdateItemDto } from './dto';

/** 操作人：id + 用户名快照（用户名只在 AuthUser 上） */
function actorOf(user: AuthUser): ActivityActor {
  return { id: user.id, name: user.username };
}

@Controller('items')
export class ItemsController {
  constructor(
    private readonly items: ItemsService,
    private readonly activity: ActivityService,
  ) {}

  @FamilyScoped()
  @Get()
  list(@CurrentFamily() family: FamilyContext, @Query() query: QueryItemsDto) {
    return this.items.list(family.id, query);
  }

  /** 必须放在 :id 之前，否则 export.csv 会被当成 id */
  @FamilyScoped()
  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="homebucket-items.csv"')
  exportCsv(@CurrentFamily() family: FamilyContext, @Query() query: QueryItemsDto) {
    return this.items.exportCsv(family.id, query);
  }

  /**
   * 生成一个家庭内唯一的系统追溯码（物品没有厂家条码时使用）。
   * 客户端拿到后随创建请求提交；创建后不可修改。
   */
  @FamilyScoped()
  @Post('trace-code')
  async mintTraceCode(@CurrentFamily() family: FamilyContext) {
    return { traceCode: await this.items.mintTraceCode(family.id) };
  }

  /** 某个物品的操作历史（物品自身 + 其名下 SN 的操作） */
  @FamilyScoped()
  @Get(':id/history')
  history(
    @CurrentFamily() family: FamilyContext,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ActivityQueryDto,
  ) {
    return this.activity.listForItem(family.id, id, query);
  }

  @FamilyScoped()
  @Get(':id')
  detail(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.items.detail(family.id, id);
  }

  @FamilyScoped()
  @Post()
  create(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateItemDto,
  ) {
    return this.items.create(family.id, actorOf(user), dto);
  }

  @FamilyScoped()
  @Patch(':id')
  update(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateItemDto,
  ) {
    return this.items.update(family.id, actorOf(user), id, dto);
  }

  @FamilyScoped()
  @Delete(':id')
  remove(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.items.remove(family.id, actorOf(user), id);
  }

  // ---------- SN 单元 ----------

  @FamilyScoped()
  @Post(':id/units')
  addUnit(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ItemUnitDto,
  ) {
    return this.items.addUnit(family.id, actorOf(user), id, dto);
  }

  @FamilyScoped()
  @Patch(':id/units/:unitId')
  updateUnit(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('unitId', ParseIntPipe) unitId: number,
    @Body() dto: ItemUnitDto,
  ) {
    return this.items.updateUnit(family.id, actorOf(user), id, unitId, dto);
  }

  @FamilyScoped()
  @Delete(':id/units/:unitId')
  removeUnit(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('unitId', ParseIntPipe) unitId: number,
  ) {
    return this.items.removeUnit(family.id, actorOf(user), id, unitId);
  }

  // ---------- 消耗 / 补货 / 拆箱 ----------

  @FamilyScoped()
  @Post(':id/consume')
  consume(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdjustStockDto,
  ) {
    return this.items.consume(family.id, actorOf(user), id, dto);
  }

  @FamilyScoped()
  @Post(':id/restock')
  restock(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdjustStockDto,
  ) {
    return this.items.restock(family.id, actorOf(user), id, dto);
  }

  @FamilyScoped()
  @Post(':id/unpack')
  unpack(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UnpackDto,
  ) {
    return this.items.unpack(family.id, actorOf(user), id, dto);
  }
}
