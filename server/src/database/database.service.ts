import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * 数据库连通性探测，供 /health 使用。
 *
 * 不抛异常、只返回布尔值：库连不上时接口仍要能回话，
 * 让 /health 报 degraded 而不是整个服务起不来。
 */
@Injectable()
export class DatabaseService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** 探活：跑一条最轻的 SQL；连不上或没初始化都算失败 */
  async ping(): Promise<boolean> {
    try {
      if (!this.dataSource.isInitialized) return false;
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /** 当前 provider，用于诊断信息 */
  get driver(): string {
    return this.dataSource.options.type;
  }
}
