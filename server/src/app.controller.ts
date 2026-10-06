import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from './database/database.service';
import { env } from './config/env';

/** 站点级信息与健康检查（无业务逻辑，所以没有独立的 service） */
@Controller()
export class AppController {
  constructor(private readonly database: DatabaseService) {}

  /** 服务自述：前端启动时可以据此显示环境与数据库类型 */
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
    const db = await this.database.ping();
    return { status: db ? 'ok' : 'degraded', db };
  }
}
