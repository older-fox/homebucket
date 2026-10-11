import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CatalogItem } from '../entities/catalog-item.entity';
import { Contribution } from '../entities/contribution.entity';
import { CollectorInstance } from '../entities/collector-instance.entity';
import { env } from '../config/env';

const STARTED_AT = Date.now();

/**
 * 健康检查：既要能当 k8s/docker 探针（快、只读），也要在运维登录不进去时
 * 用一条 curl 说清"这个实例是谁、什么版本、注册开关、库里有多少东西"。
 */
@Controller()
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get('health')
  async health() {
    return {
      status: 'ok',
      service: 'homebucket-collector',
      version: env.version,
      nodeEnv: env.nodeEnv,
      uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
      registrationOpen: env.registrationOpen,
      storage: {
        provider: env.dbProvider,
        dataFile: env.dataFile,
        items: await this.dataSource.getRepository(CatalogItem).count(),
        contributions: await this.dataSource.getRepository(Contribution).count(),
        instances: await this.dataSource.getRepository(CollectorInstance).count(),
      },
    };
  }
}
