import { Controller, Get } from '@nestjs/common';
import { StatsService } from './stats.service';

/** 统计概览是公开的（只看聚合数字，不含任何家庭私有信息） */
@Controller('v1')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('stats')
  overview() {
    return this.statsService.overview();
  }
}
