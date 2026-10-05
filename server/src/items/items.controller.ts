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
import { CurrentFamily, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import { ItemsService } from './items.service';
import { CreateItemDto, ItemUnitDto, QueryItemsDto, UpdateItemDto } from './dto';

@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

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

  @FamilyScoped()
  @Get(':id')
  detail(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.items.detail(family.id, id);
  }

  @FamilyScoped()
  @Post()
  create(@CurrentFamily() family: FamilyContext, @Body() dto: CreateItemDto) {
    return this.items.create(family.id, dto);
  }

  @FamilyScoped()
  @Patch(':id')
  update(
    @CurrentFamily() family: FamilyContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateItemDto,
  ) {
    return this.items.update(family.id, id, dto);
  }

  @FamilyScoped()
  @Delete(':id')
  remove(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.items.remove(family.id, id);
  }

  // ---------- SN 单元 ----------

  @FamilyScoped()
  @Post(':id/units')
  addUnit(
    @CurrentFamily() family: FamilyContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ItemUnitDto,
  ) {
    return this.items.addUnit(family.id, id, dto);
  }

  @FamilyScoped()
  @Patch(':id/units/:unitId')
  updateUnit(
    @CurrentFamily() family: FamilyContext,
    @Param('id', ParseIntPipe) id: number,
    @Param('unitId', ParseIntPipe) unitId: number,
    @Body() dto: ItemUnitDto,
  ) {
    return this.items.updateUnit(family.id, id, unitId, dto);
  }

  @FamilyScoped()
  @Delete(':id/units/:unitId')
  removeUnit(
    @CurrentFamily() family: FamilyContext,
    @Param('id', ParseIntPipe) id: number,
    @Param('unitId', ParseIntPipe) unitId: number,
  ) {
    return this.items.removeUnit(family.id, id, unitId);
  }
}
