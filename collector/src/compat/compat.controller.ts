import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CompatService } from './compat.service';
import { ObservationCompatDto } from './dto';

/**
 * 主仓库实例客户端专用的极简接口（老契约，路径与根 README 里写的一致）。
 *
 * 刻意**不挂任何守卫**：老的实例客户端不会带 `x-collector-key`。
 * 这两个路由与收集器自己的 v1 接口可以共存 —— 读接口本来就不鉴权，
 * 写接口的区别只是"这条上报能不能追到一个注册实例"。
 */
@Controller('v1')
export class CompatController {
  constructor(private readonly compatService: CompatService) {}

  /** `GET /api/v1/barcodes/:code` —— 收录返回 200，未收录返回 404 `item.notFound` */
  @Get('barcodes/:code')
  async lookup(@Param('code') code: string) {
    return this.compatService.lookup(code);
  }

  /**
   * `POST /api/v1/observations` —— 老客户端只要 2xx 就算成功。
   * 默认的 POST 201 也行，但老契约文档写的是 "2xx → accepted"，这里固定 200，
   * 便于任何按 200 判断的旧代码。
   */
  @Post('observations')
  @HttpCode(HttpStatus.OK)
  async observe(@Body() dto: ObservationCompatDto) {
    return this.compatService.observe(dto);
  }
}
