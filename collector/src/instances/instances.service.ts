import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { CollectorInstance } from '../entities/collector-instance.entity';
import { env } from '../config/env';
import { isoNow } from '../common/time';
import { normalizePaging } from '../common/pagination';
import type { InstanceContext } from '../common/decorators';

export interface RegisterResult {
  id: number;
  name: string;
  /** 明文 key：**只在这一刻返回一次**，库里只存 sha256 */
  key: string;
  keyPrefix: string;
  createdAt: string;
}

export interface InstanceRowView {
  id: number;
  name: string;
  keyPrefix: string;
  platform: string | null;
  version: string | null;
  contributionCount: number;
  blocked: boolean;
  blockedReason: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

/** 同一个实例的连续上报不要每次都写库（lastSeenAt 的精度到分钟就够审计用了） */
const LAST_SEEN_TOUCH_MS = 60_000;

/**
 * 实例（上报方）的身份。
 *
 * 与 HomeBucket 主服务的 API key 同一套凭据做法：只存 sha256、明文只返回一次、列表只显示前缀。
 * 唯一区别是**没有签发流程**：实例首次运行时自己调 register 拿 key 存在本地，
 * 因为"所有实例都会自动上报"，让人工去签发就等于把自动化的前提砍掉了。
 * 代价是任何人都能注册；收益是每条上报都可追溯、可封禁 —— 这是公共资料库能维持质量的前提。
 */
@Injectable()
export class InstancesService {
  private readonly touchedAt = new Map<number, number>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private get repo() {
    return this.dataSource.getRepository(CollectorInstance);
  }

  async register(dto: { name: string; platform?: string; version?: string }): Promise<RegisterResult> {
    if (!env.registrationOpen) {
      throw new ForbiddenException({
        code: 'instance.registrationClosed',
        message: '本收集器已关闭实例注册，请联系管理员',
      });
    }
    const key = `hbc_${randomBytes(20).toString('hex')}`;
    const row = await this.repo.save(
      this.repo.create({
        name: dto.name.trim(),
        keyPrefix: key.slice(0, 12),
        keyHash: hashKey(key),
        platform: dto.platform ?? null,
        version: dto.version ?? null,
        contributionCount: 0,
        blocked: false,
        lastSeenAt: null,
      }),
    );
    return {
      id: row.id,
      name: row.name,
      key,
      keyPrefix: row.keyPrefix,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** X-Collector-Key → 实例上下文；返回 null 由守卫决定怎么报错 */
  async authenticate(token: string | undefined): Promise<InstanceContext | null> {
    if (!token) return null;
    const row = await this.repo.findOneBy({ keyHash: hashKey(token) });
    if (!row) return null;
    if (row.blocked) {
      throw new ForbiddenException({
        code: 'instance.blocked',
        message: `实例已被封禁${row.blockedReason ? `：${row.blockedReason}` : ''}`,
      });
    }
    const now = Date.now();
    const last = this.touchedAt.get(row.id) ?? 0;
    if (now - last > LAST_SEEN_TOUCH_MS) {
      this.touchedAt.set(row.id, now);
      await this.repo.update({ id: row.id }, { lastSeenAt: isoNow() });
    }
    return { id: row.id, name: row.name, keyPrefix: row.keyPrefix };
  }

  async requireById(id: number): Promise<CollectorInstance> {
    const row = await this.repo.findOneBy({ id });
    if (!row) {
      throw new NotFoundException({ code: 'instance.notFound', message: `实例 ${id} 不存在` });
    }
    return row;
  }

  async list(paging: { page?: number; pageSize?: number }): Promise<{
    instances: InstanceRowView[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { page, pageSize, skip, take } = normalizePaging(paging);
    const [rows, total] = await this.repo.findAndCount({
      order: { contributionCount: 'DESC', id: 'ASC' },
      skip,
      take,
    });
    return { instances: rows.map((row) => this.toView(row)), total, page, pageSize };
  }

  async setBlocked(id: number, blocked: boolean, reason?: string): Promise<InstanceRowView> {
    const row = await this.requireById(id);
    row.blocked = blocked;
    row.blockedReason = blocked ? (reason ?? null) : null;
    row.blockedAt = blocked ? isoNow() : null;
    const saved = await this.repo.save(row);
    return this.toView(saved);
  }

  async bumpContributionCount(instanceId: number): Promise<void> {
    await this.repo.increment({ id: instanceId }, 'contributionCount', 1);
  }

  toView(row: CollectorInstance): InstanceRowView {
    return {
      id: row.id,
      name: row.name,
      keyPrefix: row.keyPrefix,
      platform: row.platform,
      version: row.version,
      contributionCount: row.contributionCount,
      blocked: row.blocked,
      blockedReason: row.blockedReason,
      lastSeenAt: row.lastSeenAt ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function hashKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
