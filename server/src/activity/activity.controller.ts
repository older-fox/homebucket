import { Controller, Get, Query } from '@nestjs/common';
import { CurrentFamily, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import { ActivityService } from './activity.service';
import { ActivityQueryDto } from './dto';

/** 家庭级操作历史（只读）。物品维度的历史走 GET /items/:id/history。 */
@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @FamilyScoped()
  @Get()
  list(@CurrentFamily() family: FamilyContext, @Query() query: ActivityQueryDto) {
    return this.activity.list(family.id, query);
  }
}
