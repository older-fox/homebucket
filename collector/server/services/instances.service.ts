import { createHash, randomBytes } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { getDataSource } from '../database/db';
import type { CollectorInstanceRow } from '../database/entities';
import { env } from '../utils/env';
import { forbidden, notFound } from '../utils/http';
import { normalizePaging } from '../utils/pagination';
import { isoNow } from '../utils/time';
import { instancesRepo } from './repositories';

export interface RegisterInstanceDto {
  name: string;
  platform?: string;
  version?: string;
}

export interface InstanceIdentity {
  id: number;
  name: string;
  keyPrefix: string;
}

export interface InstanceView {
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

/** 同一个实例的 lastSeenAt 最多每分钟写一次：每次上报都写会把库写热，而它只用于"最近活跃"展示 */
const LAST_SEEN_TOUCH_MS = 60_000;

/**
 * 收集器实例（HomeBucket 客户端）的注册与凭据校验。
 *
 * 明文 key 只在注册响应里出现一次，库里只存 `sha256(key)`：截获数据库也拿不到可用凭据。
 * `keyPrefix` 是给人看的（纠错台列表里区分是哪台机器），不参与校验。
 */
export class InstancesService {
  private readonly lastSeenTouchedAt = new Map<number, number>();

  constructor(private readonly source: DataSource = getDataSource()) {}

  /** 注册新实例，返回明文 key —— 这是唯一一次返回 */
  async register(dto: RegisterInstanceDto): Promise<{
    id: number;
    name: string;
    key: string;
    keyPrefix: string;
    createdAt: string;
  }> {
    if (!env.registrationOpen) {
      throw forbidden('instance.registrationClosed', '本收集器已关闭实例注册，请联系管理员');
    }
    const key = `hbc_${randomBytes(20).toString('hex')}`;
    const keyPrefix = key.slice(0, 12);
    const saved = await instancesRepo(this.manager()).save({
      name: dto.name.trim(),
      keyPrefix,
      keyHash: hashKey(key),
      platform: dto.platform ?? null,
      version: dto.version ?? null,
      lastSeenAt: null,
      contributionCount: 0,
      blocked: false,
      blockedReason: null,
      blockedAt: null,
    });
    return {
      id: saved.id,
      name: saved.name,
      key: key,
      keyPrefix: saved.keyPrefix,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  /**
   * 凭据 → 身份。
   *
   * 返回 null 表示"这个 token 不认识"（由调用方决定 401 文案）；
   * 已封禁的实例直接抛 403，因为封禁是管理动作，不该被当成"凭据错误"让实例去重注册。
   */
  async authenticate(token?: string): Promise<InstanceIdentity | null> {
    if (!token) return null;
    const row = await instancesRepo(this.manager()).findOne({ where: { keyHash: hashKey(token) } });
    if (!row) return null;
    if (row.blocked) {
      throw forbidden(
        'instance.blocked',
        `实例已被封禁${row.blockedReason ? `：${row.blockedReason}` : ''}`,
      );
    }
    await this.touchLastSeen(row);
    return { id: row.id, name: row.name, keyPrefix: row.keyPrefix };
  }

  async requireById(id: number): Promise<CollectorInstanceRow> {
    const row = await instancesRepo(this.manager()).findOne({ where: { id } });
    if (!row) {
      throw notFound('instance.notFound', `实例 ${id} 不存在`);
    }
    return row;
  }

  async list(paging: { page?: number; pageSize?: number }): Promise<{
    instances: InstanceView[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { page, pageSize, skip, take } = normalizePaging(paging);
    const [rows, total] = await instancesRepo(this.manager()).findAndCount({
      order: { contributionCount: 'DESC', id: 'ASC' },
      skip,
      take,
    });
    return { instances: rows.map((row) => this.toView(row)), total, page, pageSize };
  }

  async setBlocked(
    id: number,
    blocked: boolean,
    reason?: string,
  ): Promise<CollectorInstanceRow> {
    const row = await this.requireById(id);
    row.blocked = blocked;
    row.blockedReason = blocked ? (reason ?? null) : null;
    row.blockedAt = blocked ? isoNow() : null;
    return instancesRepo(this.manager()).save(row);
  }

  toView(row: CollectorInstanceRow): InstanceView {
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

  private async touchLastSeen(row: CollectorInstanceRow): Promise<void> {
    const last = this.lastSeenTouchedAt.get(row.id) ?? 0;
    const now = Date.now();
    if (now - last < LAST_SEEN_TOUCH_MS) return;
    this.lastSeenTouchedAt.set(row.id, now);
    await instancesRepo(this.manager()).update({ id: row.id }, { lastSeenAt: isoNow() });
  }

  private manager(): DataSource['manager'] {
    return this.source.manager;
  }
}

/** 库里只存 SHA-256，明文只在注册那一刻存在于内存与响应里 */
export function hashKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
