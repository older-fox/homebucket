import { Controller, Get, Query } from '@nestjs/common';
import { CurrentFamily, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import { SearchService } from './search.service';

/**
 * 全局搜索的 HTTP 入口：只做路由与 query 绑定，检索逻辑在 SearchService。
 * 路由 /search 与守卫装饰器保持不变。
 */
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @FamilyScoped()
  @Get()
  run(@CurrentFamily() family: FamilyContext, @Query('q') q: string) {
    return this.search.search(family.id, q);
  }
}
