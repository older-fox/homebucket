import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

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

  @Get('health')
  async health() {
    const db = await this.prisma.ping();
    return { status: db ? 'ok' : 'degraded', db };
  }
}
