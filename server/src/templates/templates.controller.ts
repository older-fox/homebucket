import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { CurrentFamily, CurrentUser, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { CreateTemplateDto, UpdateTemplateDto, UseTemplateDto } from './dto';
import { TemplatesService } from './templates.service';

/** 操作人：id + 用户名快照 */
function actorOf(user: AuthUser) {
  return { id: user.id, name: user.username };
}

/** 模板 HTTP 层：只做路由与参数绑定，业务逻辑全在 TemplatesService */
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @FamilyScoped()
  @Get()
  list(@CurrentFamily() family: FamilyContext) {
    return this.templates.list(family.id);
  }

  @FamilyScoped()
  @Get(':id')
  detail(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.templates.detail(family.id, id);
  }

  @FamilyScoped()
  @Post()
  create(@CurrentFamily() family: FamilyContext, @Body() dto: CreateTemplateDto) {
    return this.templates.create(family.id, dto);
  }

  @FamilyScoped()
  @Patch(':id')
  update(
    @CurrentFamily() family: FamilyContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templates.update(family.id, id, dto);
  }

  @FamilyScoped()
  @Delete(':id')
  remove(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.templates.remove(family.id, id);
  }

  @FamilyScoped()
  @Post(':id/items')
  createItem(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UseTemplateDto,
  ) {
    return this.templates.createItem(family.id, actorOf(user), id, dto);
  }
}
