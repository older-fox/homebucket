import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { InstancesService } from './instances.service';
import { QueryInstancesDto, RegisterInstanceDto } from './dto';
import { InstanceKeyGuard } from './instance-key.guard';
import { CurrentInstance, type InstanceContext } from '../common/decorators';

/**
 * 实例侧接口：注册 + 自查。
 * 注意没有"列出所有实例"的公开接口 —— 实例名单属于运维视图，只从 /admin 暴露。
 */
@Controller('v1')
export class InstancesController {
  constructor(private readonly instances: InstancesService) {}

  /**
   * 自我注册：实例首次运行时调用，拿到自己的 key（**只返回一次**）并存在本地。
   * 幂等性说明：本接口不幂等 —— 每次调用都会新建一个实例身份。
   * 这是刻意的：实例端应当"注册一次、把 key 存进配置文件"，重复注册只会在审计页多一行。
   */
  @Post('instances')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterInstanceDto) {
    const result = await this.instances.register(dto);
    return {
      ...result,
      note: '请把 key 保存到实例配置里：这是唯一一次返回明文',
    };
  }

  /** 实例自查：确认 key 有效、看到自己的名字与累计上报数 */
  @Get('instances/me')
  @UseGuards(InstanceKeyGuard)
  async me(@CurrentInstance() instance: InstanceContext, @Query() _query: QueryInstancesDto) {
    const row = await this.instances.requireById(instance.id);
    return this.instances.toView(row);
  }
}
