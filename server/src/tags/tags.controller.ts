import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { CurrentFamily, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import { CreateTagDto, UpdateTagDto } from './dto';
import { TagsService } from './tags.service';

/** 标签 HTTP 层：只做路由与参数绑定，业务逻辑全在 TagsService */
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @FamilyScoped()
  @Get()
  list(@CurrentFamily() family: FamilyContext) {
    return this.tags.list(family.id);
  }

  @FamilyScoped()
  @Post()
  create(@CurrentFamily() family: FamilyContext, @Body() dto: CreateTagDto) {
    return this.tags.create(family.id, dto);
  }

  @FamilyScoped()
  @Patch(':id')
  update(
    @CurrentFamily() family: FamilyContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTagDto,
  ) {
    return this.tags.update(family.id, id, dto);
  }

  @FamilyScoped()
  @Delete(':id')
  remove(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.tags.remove(family.id, id);
  }
}
