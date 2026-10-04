import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    // 连不上库时不阻断启动，让 /health 能报出 degraded
    try {
      await this.$connect();
    } catch (error) {
      console.error(`[prisma] 数据库连接失败：${(error as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** 数据库连通性探测，用于 /health */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
