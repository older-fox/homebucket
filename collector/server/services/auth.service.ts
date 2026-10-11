import { Not, type DataSource, type EntityManager } from 'typeorm';
import type { H3Event } from 'h3';
import { getDataSource } from '../database/db';
import type { AdminSessionRow, AdminUserRow } from '../database/entities';
import { env } from '../utils/env';
import { badRequest, unauthorized } from '../utils/http';
import { isoNow } from '../utils/time';
import {
  hashPassword,
  newSessionToken,
  sessionTokenFrom,
  sessionTokenHash,
  verifyPassword,
} from '../utils/auth';
import { adminSessionsRepo, adminUsersRepo } from './repositories';

/**
 * 管理端账号与会话。
 *
 * ── 三件事，一个文件 ──
 *  1. **引导建号**：库里没有管理员时，按 .env 里的账号口令建一个（需求："初始化时直接创建"）。
 *     已经有账号就什么都不做 —— 界面上改过的密码不能被下次重启改回 .env 的值。
 *  2. **登录/退出/改密码**：口令用 scrypt 校验，会话是库里的行 + httpOnly cookie。
 *  3. **守卫**：`requireAdminSession(event)` 供所有 /api/admin/* 路由调用。
 *
 * ── 为什么口令校验失败与"用户名不存在"回同一个错误 ──
 * 分开报"用户不存在"/"密码错误"等于给攻击者一个免费的账号枚举接口。
 * 并且用户名不存在时也会拿一个假哈希跑一遍 scrypt（见 dummyPasswordHash），
 * 让两条路径的耗时接近，不靠时序泄露账号是否存在。
 */

export interface AdminUserView {
  id: number;
  username: string;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
}

export interface AdminSessionContext {
  user: AdminUserView;
  /** 当前会话的过期时间（ISO 字符串） */
  expiresAt: string;
  /** 当前会话的 token 哈希（改密码时用它把"这条会话"排除在吊销之外） */
  tokenHash: string;
}

export interface AdminLoginResult {
  user: AdminUserView;
  /** 明文令牌：只在这一刻出现，调用方负责放进 httpOnly cookie */
  token: string;
  expiresAt: string;
}

export interface AdminBootstrapResult {
  created: boolean;
  reset: boolean;
  username: string;
}

/** 多久写一次 lastUsedAt：管理接口每次请求都写一次库没意义，但也别完全不记 */
const SESSION_TOUCH_MS = 60_000;

/** 供时序对齐用的假哈希：第一次需要时才计算（别把 scrypt 成本塞进启动路径） */
let dummyHash: string | null = null;
function dummyPasswordHash(): string {
  dummyHash ??= hashPassword('timing-equalization-placeholder');
  return dummyHash;
}

function toUserView(row: AdminUserRow): AdminUserView {
  return {
    id: row.id,
    username: row.username,
    lastLoginAt: row.lastLoginAt ?? null,
    passwordChangedAt: row.passwordChangedAt ?? null,
    createdAt: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)).toISOString(),
  };
}

export class AuthService {
  constructor(private readonly source: DataSource = getDataSource()) {}

  private users(manager?: EntityManager) {
    return adminUsersRepo(manager ?? this.source.manager);
  }

  private sessions(manager?: EntityManager) {
    return adminSessionsRepo(manager ?? this.source.manager);
  }

  private get ttlMs(): number {
    return env.sessionTtlHours * 3600_000;
  }

  /**
   * 启动引导：库为空则按 .env 建号；`COLLECTOR_ADMIN_FORCE_RESET=true` 时用 .env 的口令
   * 重置已有账号（忘了密码的兜底，重置会连带吊销全部会话）。
   */
  async bootstrapAdmin(): Promise<AdminBootstrapResult> {
    const repo = this.users();
    // take:1 + 显式排序，不用 findOne({ where: {} })：后者在部分 TypeORM 版本上要求非空条件
    const [existing] = await repo.find({ order: { id: 'ASC' }, take: 1 });
    const now = isoNow();

    if (!existing) {
      await repo.save({
        username: env.admin.username,
        passwordHash: hashPassword(env.admin.password),
        passwordChangedAt: now,
        lastLoginAt: null,
      });
      return { created: true, reset: false, username: env.admin.username };
    }

    if (!env.adminForceReset) {
      // 用户名以库里的为准：.env 改名不该悄悄造出第二个账号
      return { created: false, reset: false, username: existing.username };
    }

    await this.source.transaction(async (manager) => {
      await this.users(manager).update(
        { id: existing.id },
        { passwordHash: hashPassword(env.admin.password), passwordChangedAt: now },
      );
      // 重置口令等于"这把钥匙可能已经外泄"，所有会话一并作废
      await this.sessions(manager).delete({ adminUserId: existing.id });
    });
    return { created: false, reset: true, username: existing.username };
  }

  /** 登录：成功则建一条会话并返回明文令牌（由调用方写进 cookie） */
  async login(username: string, password: string, userAgent: string | null): Promise<AdminLoginResult> {
    const user = await this.users().findOne({ where: { username } });
    // 用户不存在也走一遍 scrypt：否则"快 = 账号不存在"就成了账号枚举接口
    const stored = user?.passwordHash ?? dummyPasswordHash();
    const ok = verifyPassword(password, stored);
    if (!user || !ok) {
      throw unauthorized('admin.badCredentials', '用户名或密码不正确');
    }

    const now = isoNow();
    const expiresAt = new Date(Date.now() + this.ttlMs).toISOString();
    const token = newSessionToken();
    await this.sessions().save({
      tokenHash: sessionTokenHash(token),
      adminUserId: user.id,
      expiresAt,
      lastUsedAt: now,
      userAgent: userAgent === null ? null : userAgent.slice(0, 200),
    });
    await this.users().update({ id: user.id }, { lastLoginAt: now });
    // 顺手清掉过期会话：单节点 + 只有一个管理员，不值得为清理单开定时任务
    await this.purgeExpiredSessions(now);

    return { user: toUserView({ ...user, lastLoginAt: now }), token, expiresAt };
  }

  /**
   * 校验会话。三种失败各有自己的 code，前端才能区分"没登录"（引导去登录页）
   * 与"登录过期"（提示重新登录）。
   */
  async verify(token: string): Promise<AdminSessionContext> {
    const tokenHash = sessionTokenHash(token);
    const session = await this.sessions().findOne({ where: { tokenHash } });
    if (!session) {
      throw unauthorized('admin.sessionInvalid', '登录状态已失效，请重新登录');
    }
    const now = isoNow();
    if (session.expiresAt <= now) {
      await this.sessions().delete({ tokenHash });
      throw unauthorized('admin.sessionExpired', '登录已过期，请重新登录');
    }
    const user = await this.users().findOne({ where: { id: session.adminUserId } });
    if (!user) {
      // 账号被删了（正常流程里不会），会话就不该继续有效
      await this.sessions().delete({ tokenHash });
      throw unauthorized('admin.sessionInvalid', '登录状态已失效，请重新登录');
    }

    const context = await this.touchSession(session, now);
    return { user: toUserView(user), expiresAt: context.expiresAt, tokenHash };
  }

  /**
   * 会话续期与"最近使用时间"。
   *  · 有效期过半才续（滑动过期），否则每个请求都写库；
   *  · lastUsedAt 最多每分钟写一次，同样是省写操作。
   */
  private async touchSession(
    session: AdminSessionRow,
    now: string,
  ): Promise<{ expiresAt: string }> {
    const patch: Partial<AdminSessionRow> = {};
    const remaining = Date.parse(session.expiresAt) - Date.parse(now);
    let expiresAt = session.expiresAt;
    if (remaining < this.ttlMs / 2) {
      expiresAt = new Date(Date.now() + this.ttlMs).toISOString();
      patch.expiresAt = expiresAt;
    }
    const touchedAt = session.lastUsedAt ? Date.parse(session.lastUsedAt) : 0;
    if (Date.parse(now) - touchedAt > SESSION_TOUCH_MS) {
      patch.lastUsedAt = now;
    }
    if (Object.keys(patch).length > 0) {
      await this.sessions().update({ tokenHash: session.tokenHash }, patch);
    }
    return { expiresAt };
  }

  /** 退出登录：删掉这条会话。令牌本身就无效时也当成功（幂等） */
  async logout(token: string): Promise<{ revoked: boolean }> {
    const result = await this.sessions().delete({ tokenHash: sessionTokenHash(token) });
    return { revoked: (result.affected ?? 0) > 0 };
  }

  /**
   * 改密码：必须带当前口令；新口令不能与旧的相同；
   * 改完**吊销除当前会话以外的所有会话** —— 改密码的常见动机就是"怀疑别人登进来了"。
   *
   * 入参直接收 `AdminSessionContext`（而不是再传一次 token）：路由已经用守卫校验过一次，
   * 这里再查一遍会话表纯属浪费，也让"当前会话是谁"这件事只有一个来源。
   */
  async changePassword(
    context: AdminSessionContext,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ user: AdminUserView; revokedSessions: number }> {
    const user = await this.users().findOne({ where: { id: context.user.id } });
    if (!user) {
      throw unauthorized('admin.sessionInvalid', '登录状态已失效，请重新登录');
    }
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      throw badRequest('admin.badCurrentPassword', '当前密码不正确');
    }
    if (verifyPassword(newPassword, user.passwordHash)) {
      throw badRequest('admin.passwordUnchanged', '新密码不能与当前密码相同');
    }

    const now = isoNow();
    const revoked = await this.source.transaction(async (manager) => {
      await this.users(manager).update(
        { id: user.id },
        { passwordHash: hashPassword(newPassword), passwordChangedAt: now },
      );
      const result = await this.sessions(manager).delete({
        adminUserId: user.id,
        tokenHash: Not(context.tokenHash),
      });
      return result.affected ?? 0;
    });

    return { user: toUserView({ ...user, passwordChangedAt: now }), revokedSessions: revoked };
  }

  /** 清掉过期会话，返回删除条数（启动/登录时顺手调用） */
  async purgeExpiredSessions(now: string = isoNow()): Promise<number> {
    const result = await this.sessions()
      .createQueryBuilder()
      .delete()
      .where('expiresAt <= :now', { now })
      .execute();
    return result.affected ?? 0;
  }
}

/**
 * 管理接口守卫：没有 cookie → 401 `admin.sessionMissing`；
 * 令牌不存在/被吊销 → `admin.sessionInvalid`；过期 → `admin.sessionExpired`。
 */
export async function requireAdminSession(event: H3Event): Promise<AdminSessionContext> {
  const token = sessionTokenFrom(event);
  if (!token) {
    throw unauthorized('admin.sessionMissing', '请先登录');
  }
  return new AuthService().verify(token);
}
