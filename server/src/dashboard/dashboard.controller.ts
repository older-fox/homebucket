import { Controller, Get } from '@nestjs/common';
import { CurrentFamily, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import { DashboardService } from './dashboard.service';

/** 首页概览入口（职责：只声明路由，聚合逻辑在 DashboardService） */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @FamilyScoped()
  @Get()
  summary(@CurrentFamily() family: FamilyContext) {
    return this.dashboard.summary(family.id);
  }
}
