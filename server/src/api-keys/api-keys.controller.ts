import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Authed, CurrentUser } from '../common/decorators';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto';

/**
 * key 管理接口（设置页用）。
 *
 * 一律 `@Authed()`：管理 key 必须用应用自身的 JWT 会话，
 * **API key 本身不能管理 API key**（否则一把泄露的只读 key 能凭空造出新 key）。
 */
@Controller('api-keys')
@Authed()
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.apiKeys.list(user.id);
  }

  /** 响应里的 `token` 是明文，只出现这一次 */
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateApiKeyDto) {
    return this.apiKeys.create(user.id, dto);
  }

  /** 用 DELETE 表达「撤销」：库里留软标记 revokedAt，便于审计 */
  @Delete(':id')
  revoke(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.apiKeys.revoke(user.id, id);
  }
}
