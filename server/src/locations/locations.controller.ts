import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { CurrentFamily, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import { CreateLocationDto, MoveLocationDto, UpdateLocationDto } from './dto';
import { LocationsService } from './locations.service';

/**
 * 位置域的 HTTP 入口：只负责路由与参数绑定，业务逻辑全部在 LocationsService。
 * 路由路径 / 守卫装饰器与原 locations.module.ts 完全一致（未动全局前缀 /api）。
 */
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @FamilyScoped()
  @Get('tree')
  tree(@CurrentFamily() family: FamilyContext) {
    return this.locations.tree(family.id);
  }

  @FamilyScoped()
  @Post()
  create(@CurrentFamily() family: FamilyContext, @Body() dto: CreateLocationDto) {
    return this.locations.create(family.id, dto);
  }

  @FamilyScoped()
  @Get(':id/contents')
  contents(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.locations.contents(family.id, id);
  }

  @FamilyScoped()
  @Get(':id')
  detail(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.locations.detail(family.id, id);
  }

  @FamilyScoped()
  @Patch(':id/move')
  move(
    @CurrentFamily() family: FamilyContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MoveLocationDto,
  ) {
    return this.locations.move(family.id, id, dto);
  }

  @FamilyScoped()
  @Patch(':id')
  update(
    @CurrentFamily() family: FamilyContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locations.update(family.id, id, dto);
  }

  @FamilyScoped()
  @Delete(':id')
  remove(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.locations.remove(family.id, id);
  }
}
