import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { ApiKey } from '../entities/api-key.entity';
import { User } from '../entities/user.entity';
import type { AuthUser } from '../auth/jwt-auth.guard';
import type { CreateApiKeyDto } from './dto';

/** 明文 token 的前缀：让用户一眼认出这是 homebucket 的 key，也方便按前缀区分 */
export const API_KEY_PREFIX = 'hb_';

/** 单账号最多同时持有的「未撤销」key 数 */
const MAX_ACTIVE_KEYS = 20;

/**
 * 明文 token → 库里存的摘要。
 * guard 与 service 共用这一份实现：哈希口径一旦分叉，鉴权就会静默失效。
 */
export function hashApiKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * API key 的增删查 + 鉴权。
 *
 * 库里不存明文（只有 sha256 摘要），所以：创建时返回一次明文，之后永远拿不回来；
 * 列表只能显示 `prefix` 前缀 —— 这是有意的取舍，理由写在 api-key.entity.ts 顶部。
 */
@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKey) private readonly keys: Repository<ApiKey>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async list(userId: number) {
    const rows = await this.keys.find({
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return rows.map((row) => this.toSummary(row));
  }

  /** 建 key：明文 token 只在这个返回值里出现一次 */
  async create(userId: number, dto: CreateApiKeyDto) {
    const active = await this.keys.count({ where: { userId, revokedAt: IsNull() } });
    if (active >= MAX_ACTIVE_KEYS) {
      throw new BadRequestException({
        code: 'apiKey.limitReached',
        message: `最多只能同时保留 ${MAX_ACTIVE_KEYS} 把未撤销的 key`,
      });
    }

    const secret = randomBytes(24).toString('base64url');
    const token = `${API_KEY_PREFIX}${secret}`;

    const row = await this.keys.save(
      this.keys.create({
        userId,
        name: dto.name,
        // 前缀只截明文开头：列表里够区分，又短到不可能被误当成完整凭据
        prefix: `${API_KEY_PREFIX}${secret.slice(0, 8)}`,
        keyHash: hashApiKey(token),
        expiresAt: this.parseExpiry(dto.expiresAt),
        lastUsedAt: null,
        revokedAt: null,
      }),
    );

    return { ...this.toSummary(row), token };
  }

  /** 撤销：软标记（保留审计痕迹），重复调用幂等 */
  async revoke(userId: number, id: number) {
    const row = await this.keys.findOne({ where: { id, userId } });
    if (!row) throw new NotFoundException({ code: 'apiKey.notFound', message: 'API key 不存在' });

    if (!row.revokedAt) {
      row.revokedAt = new Date();
      await this.keys.save(row);
    }
    return this.toSummary(row);
  }

  /**
   * 明文 token → 用户身份（v1 只读接口的鉴权入口）。
   * 返回 null 表示「无效 / 已撤销 / 已过期 / 账号已不存在」，由 guard 统一转 401。
   */
  async authenticate(token: string): Promise<AuthUser | null> {
    const row = await this.keys.findOne({ where: { keyHash: hashApiKey(token) } });
    if (!row || row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;

    // 每次回库读一次用户：key 是长期凭据，不能沿用创建时的用户名（可能已改名）
    const user = await this.users.findOne({
      where: { id: row.userId },
      select: { id: true, email: true, username: true },
    });
    if (!user) return null;

    await this.keys.update({ id: row.id }, { lastUsedAt: new Date() });
    return { id: user.id, email: user.email, username: user.username };
  }

  private parseExpiry(value?: string): Date | null {
    if (!value) return null;

    const parsed = new Date(value);
    // 2026-02-31 这类「格式对但不存在」的日期会被 Date 判成 Invalid Date
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'apiKey.invalidExpiry',
        message: '到期时间格式不正确或已过期',
      });
    }
    return parsed;
  }

  /** 对外形状：绝不含 keyHash（甚至连它都不该出现在响应里） */
  private toSummary(row: ApiKey) {
    return {
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      lastUsedAt: toIso(row.lastUsedAt),
      expiresAt: toIso(row.expiresAt),
      revokedAt: toIso(row.revokedAt),
      createdAt: toIso(row.createdAt),
    };
  }
}

/** datetime 列在不同 provider 下可能回 Date 也可能回字符串，统一成 ISO */
function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
