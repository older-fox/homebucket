import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { H3Event } from 'h3';

/**
 * 凭据的读取与校验。
 *
 * ── 实例凭据 ──
 * 读 `x-collector-key`，也接受 `Authorization: Bearer <key>`（接入方习惯不同）。
 * 这里只负责把明文取出来；真正的查库/封禁判断在 instances.service 里 ——
 * 匿名兼容接口（老实例契约）不带任何凭据，所以"取 key"和"必须有 key"是两件事。
 *
 * ── 管理员凭据 ──
 * 迁移前是一枚环境变量里的静态令牌（请求头 `x-admin-token`），现在换成
 * "账号 + 口令 + 服务端会话"：口令只以 scrypt 哈希入库，登录成功后发一个
 * 随机令牌放在 **httpOnly cookie** 里，浏览器里的 JS 读不到它。
 * 本文件只放与数据库无关的部分（哈希、令牌、cookie 读写）；
 * 会话表的增删查与守卫见 services/auth.service.ts。
 */

export function instanceKeyFrom(event: H3Event): string | null {
  const header = (getHeader(event, 'x-collector-key') ?? '').trim();
  if (header !== '') return header;
  const authorization = (getHeader(event, 'authorization') ?? '').trim();
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  const bearer = match?.[1]?.trim() ?? '';
  return bearer === '' ? null : bearer;
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

/**
 * 口令哈希：scrypt + 每个账号一份随机盐。
 *
 * ── 为什么是 scrypt，不是 sha256 ──
 * sha256 快得离谱，GPU 每秒能试几十亿个口令，适合做"内容指纹"（实例 key 就是这么存的，
 * 因为那是 160 位随机串，没有猜测空间），但**不适合存人口令**。
 * scrypt 是内存硬的：每次校验要 16MB 内存、几十毫秒，把离线爆破的成本抬到无法承受。
 * Node 自带它，不用引第三方依赖。
 *
 * 参数写进哈希串（`scrypt$N$r$p$salt$hash`），将来调参数时老口令仍能校验通过。
 */
export const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 } as const;
const SALT_BYTES = 16;
const PASSWORD_ALGO = 'scrypt';

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(password, salt, SCRYPT.keylen, scryptOptions(SCRYPT));
  return [
    PASSWORD_ALGO,
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$');
}

/** scrypt 的内存上限：算法需要 128*N*r 字节，给两倍余量，不做成启动参数 */
function scryptOptions(params: { N: number; r: number; p: number; keylen: number }) {
  return { N: params.N, r: params.r, p: params.p, maxmem: 128 * params.N * params.r * 2 };
}

/**
 * 校验口令。存储串坏掉（被人手改过、老版本格式、列被截断）时返回 false 而不是抛错：
 * 一个坏行应该表现为"这个账号登不上"，而不是整个登录接口 500。
 */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6) return false;
  const [algo, rawN, rawR, rawP, rawSalt, rawHash] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (algo !== PASSWORD_ALGO) return false;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  // 参数做上界检查：即使有人往库里塞了 N=2^30，也不能让一个登录请求把内存吃光
  const sane =
    Number.isInteger(N) && N >= 1024 && N <= 2 ** 20 && (N & (N - 1)) === 0 &&
    Number.isInteger(r) && r >= 1 && r <= 16 &&
    Number.isInteger(p) && p >= 1 && p <= 16;
  if (!sane) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(rawSalt, 'base64');
    expected = Buffer.from(rawHash, 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = scryptSync(password, salt, expected.length, scryptOptions({ N, r, p, keylen: expected.length }));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** 会话令牌明文：`hbs_` + 160 位随机（只在登录响应/ cookie 里出现一次） */
export function newSessionToken(): string {
  return `hbs_${randomBytes(20).toString('hex')}`;
}

/** 会话令牌入库前的 sha256：库泄露不等于会话泄露（同实例 key 的思路） */
export function sessionTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 会话 cookie 名：挂在收集器自己的路径下，不与其它服务混用 */
export const SESSION_COOKIE = 'hb_collector_session';

/**
 * 是否 https 请求。cookie 的 `secure` 只能在这个判断为真时打开：
 * 收集器常被放在无 TLS 的内网里（反代在前面），若一律写 secure，
 * 浏览器不会回传 cookie，表现就是"密码对了但一直跳回登录页"。
 */
export function isSecureRequest(event: H3Event): boolean {
  const forwarded = (getHeader(event, 'x-forwarded-proto') ?? '').split(',')[0]?.trim().toLowerCase();
  if (forwarded === 'https') return true;
  return getRequestURL(event).protocol === 'https:';
}

export function setSessionCookie(event: H3Event, token: string, maxAgeSeconds: number): void {
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    // SameSite=Lax：跨站发起的 POST/PATCH 不带 cookie，管理接口因此天然免疫 CSRF
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
    secure: isSecureRequest(event),
  });
}

export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, SESSION_COOKIE, { path: '/' });
}

export function sessionTokenFrom(event: H3Event): string | null {
  const token = (getCookie(event, SESSION_COOKIE) ?? '').trim();
  return token === '' ? null : token;
}
