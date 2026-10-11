import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminTokenGuard } from './admin-token.guard';
import { SkipRateLimit } from '../common/rate-limit.guard';
import {
  BlockContributionDto,
  BlockInstanceDto,
  MergeItemDto,
  PatchItemDto,
  QueryAdminContributionsDto,
  QueryAdminInstancesDto,
} from './dto';
import { QueryItemsDto } from '../items/dto';

/**
 * 纠错台 API：整个控制器都要求 X-Admin-Token，且**不限流**。
 * 管理动作是低频、人工触发的批量操作（一次重放几百个物品很正常），
 * 让运维自己的批量纠错撞上限流是纯粹的自我伤害；这道门由令牌把守。
 */
@Controller('admin')
@UseGuards(AdminTokenGuard)
@SkipRateLimit()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /** 令牌校验（界面登录用）：通过了才有后面的接口 */
  @Get('session')
  session() {
    return this.adminService.session();
  }

  @Get('items')
  items(@Query() query: QueryItemsDto) {
    return this.adminService.items(query);
  }

  @Get('items/:id')
  itemDetail(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.itemDetail(id);
  }

  /** 人工改字段 / 清空字段 / 锁定字段 */
  @Patch('items/:id')
  patchItem(@Param('id', ParseIntPipe) id: number, @Body() dto: PatchItemDto) {
    return this.adminService.patchItem(id, dto);
  }

  /** 把 sourceItemId 并进 :id（重复条码、错别字造出的两条资料） */
  @Post('items/:id/merge')
  @HttpCode(HttpStatus.OK)
  mergeItem(@Param('id', ParseIntPipe) id: number, @Body() dto: MergeItemDto) {
    return this.adminService.mergeItems(id, dto.sourceItemId);
  }

  @Post('items/:id/recompute')
  @HttpCode(HttpStatus.OK)
  async recomputeItem(@Param('id', ParseIntPipe) id: number) {
    const { items } = await this.adminService.recomputeAll();
    return { recomputedItems: items, requested: id, note: '重放是全库动作，:id 只用于日志定位' };
  }

  @Get('contributions')
  contributions(@Query() query: QueryAdminContributionsDto) {
    return this.adminService.contributions(query);
  }

  @Post('contributions/:id/block')
  @HttpCode(HttpStatus.OK)
  blockContribution(@Param('id', ParseIntPipe) id: number, @Body() dto: BlockContributionDto) {
    return this.adminService.setContributionBlocked(id, dto);
  }

  @Get('instances')
  instances(@Query() query: QueryAdminInstancesDto) {
    return this.adminService.instances(query);
  }

  @Post('instances/:id/block')
  @HttpCode(HttpStatus.OK)
  blockInstance(@Param('id', ParseIntPipe) id: number, @Body() dto: BlockInstanceDto) {
    return this.adminService.setInstanceBlocked(id, dto);
  }

  /** 全库重放：兜底按钮 */
  @Post('recompute')
  @HttpCode(HttpStatus.OK)
  recomputeAll() {
    return this.adminService.recomputeAll();
  }
}
