import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ContributionsService } from './contributions.service';
import { CreateContributionDto } from './dto';
import { InstanceKeyGuard } from '../instances/instance-key.guard';
import { CurrentInstance, type InstanceContext } from '../common/decorators';

/**
 * 上报接口：实例把"我这边看到的这款物品信息"推上来。
 * 必须带实例 key —— 不是因为我们不信任实例，而是因为**每条资料都要能追到来源**，
 * 否则审计、屏蔽脏数据、封禁刷量都无从谈起。
 */
@Controller('v1')
export class ContributionsController {
  constructor(private readonly contributionsService: ContributionsService) {}

  @Post('contributions')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(InstanceKeyGuard)
  async create(
    @CurrentInstance() instance: InstanceContext,
    @Body() dto: CreateContributionDto,
  ) {
    return this.contributionsService.contribute(instance, dto);
  }
}
