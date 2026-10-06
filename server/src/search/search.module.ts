import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/**
 * 搜索域的模块声明（只放 @Module，检索逻辑见 search.service.ts）。
 *
 * 路径与类名保持不变，app.module.ts 仍按 ./search/search.module 引入。
 * Repository 由 @Global 的 DatabaseModule 提供，无需 forFeature。
 */
@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
