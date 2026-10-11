import { timingSafeEqual } from 'node:crypto';
import type { H3Event } from 'h3';
import { env } from './env';
import { unauthorized } from './http';

/**
 * 两套凭据的读取与校验。
 *
 * ── 实例凭据 ──
 * 读 `x-collector-key`，也接受 `Authorization: Bearer <key>`（接入方习惯不同）。
 * 这里只负责把明文取出来；真正的查库/封禁判断在 instances.service 里 ——
 * 匿名兼容接口（老实例契约）不带任何凭据，所以"取 key"和"必须有 key"是两件事。
 *
 * ── 管理令牌 ──
 * 比较必须走 timingSafeEqual：`===` 会在第一个不同字符处短路，
 * 攻击者能靠响应时间把令牌一个字符一个字符试出来。
 */

export function instanceKeyFrom(event: H3Event): string | null {
  const header = (getHeader(event, 'x-collector-key') ?? '').trim();
  if (header !== '') return header;
  const authorization = (getHeader(event, 'authorization') ?? '').trim();
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  const bearer = match?.[1]?.trim() ?? '';
  return bearer === '' ? null : bearer;
}

export function adminTokenFrom(event: H3Event): string | null {
  const header = (getHeader(event, 'x-admin-token') ?? '').trim();
  return header === '' ? null : header;
}

/** 常量时间比较（长度不同也要走一遍比较，避免长度侧信道） */
export function tokenEquals(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    // 长度不同必然不等，但仍做一次同长度比较，别让"长度不对"成为更快的分支
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/** 管理接口守卫：缺失 401 admin.tokenMissing，不匹配 401 admin.tokenInvalid */
export function requireAdminToken(event: H3Event): void {
  const provided = adminTokenFrom(event);
  if (!provided) {
    throw unauthorized('admin.tokenMissing', '缺少管理令牌：请在请求头带上 x-admin-token');
  }
  if (!tokenEquals(provided, env.adminToken)) {
    throw unauthorized('admin.tokenInvalid', '管理令牌不正确');
  }
}
