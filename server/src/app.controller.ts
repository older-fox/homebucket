import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { env } from './config/env';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  info() {
    return {
      name: 'homebucket-server',
      env: process.env.NODE_ENV ?? 'development',
      db: process.env.DB_PROVIDER ?? 'mysql',
    };
  }

  /** 前端可见的站点级开关（无需登录），目前只有是否开放注册 */
  @Get('config')
  config() {
    return { allowRegistration: env.allowRegistration };
  }

  @Get('health')
  async health() {
    const db = await this.prisma.ping();
    return { status: db ? 'ok' : 'degraded', db };
  }
}
