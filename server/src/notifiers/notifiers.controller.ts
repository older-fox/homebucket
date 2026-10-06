import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { CurrentFamily, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import { NotifiersService } from './notifiers.service';
import { CreateNotifierDto, UpdateNotifierDto } from './dto';

/** 通知器的 HTTP 入口；只做参数转发，权限由 @FamilyScoped() 守卫保证 */
@Controller('notifiers')
export class NotifiersController {
  constructor(private readonly notifiers: NotifiersService) {}

  @FamilyScoped()
  @Get()
  list(@CurrentFamily() family: FamilyContext) {
    return this.notifiers.list(family.id);
  }

  @FamilyScoped()
  @Post()
  create(@CurrentFamily() family: FamilyContext, @Body() dto: CreateNotifierDto) {
    return this.notifiers.create(family.id, dto);
  }

  @FamilyScoped()
  @Patch(':id')
  update(
    @CurrentFamily() family: FamilyContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNotifierDto,
  ) {
    return this.notifiers.update(family.id, id, dto);
  }

  @FamilyScoped()
  @Delete(':id')
  remove(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.notifiers.remove(family.id, id);
  }

  @FamilyScoped()
  @Post(':id/test')
  test(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.notifiers.test(family.id, id);
  }
}
