import { createHash } from 'node:crypto';
import type { H3Event } from 'h3';

import { badRequest } from './http';
import { env } from './env';

/**
 * 「来源」身份：一条上报到底算谁报的。
 *
 * ── 为什么不是实例 key ──
 * 收集器接到的上报**全部是匿名的**（老契约 `POST /observations` 连字段都没有），
 * 而投票、反馈加权、封禁坏来源这三件事都必须能稳定地回答"这两条上报是不是同一个来源"。
 * 于是身份只能从请求本身推导，推导顺序如下：
 *
 *   1. **自报安装 ID**（`x-collector-source` 请求头，或上报体里的 `sourceId`）——
 *      由 homeBucket 侧生成并持久化，最可靠，同一个部署换 IP 也不会被算成新来源。
 *   2. **IP + User-Agent 指纹** —— 老实例与新实例都不带 ID 时的兜底。
 *
 * 指纹是 `sha256(ip + '\u0001' + userAgent)` 的十六进制前 32 位：
 * 存哈希而不存原文，是因为 IP 属于个人信息，收集器只需要"能区分"、
 * 不需要"能还原"；32 位十六进制仍然足够区分不同来源。
 *
 * ── 这个方案已知的代价（必须让使用者看得见，所以写在代码里）──
 *   · 同一个 NAT 出口（同一办公室）的多个实例、且客户端版本相同 → 被合并成一个来源，
 *     它们的上报互相算作同一票（`sourceMerged` 标志会把这种情况标出来）。
 *   · 同一实例换 IP 或升级客户端版本 → 被算成新来源，历史权重不继承。
 * 因此界面要如实展示"这个来源是由几个不同 IP 合并来的"，而不是假装来源数就是实例数。
 */

/** 来源种类：`reported` = 上报方自报的 ID；`fingerprint` = IP+UA 推导；`none` = 两者都拿不到 */
export type SourceKind = 'reported' | 'fingerprint' | 'none';

export interface SourceIdentity {
  /** 稳定的来源键（sha256 十六进制）；`none` 时为 null —— 无身份的观测只入审计、不投票 */
  key: string | null;
  kind: SourceKind;
  /** 展示名：自报 ID 的原样前缀，或 `ip:1.2.3.4` 这类可读标签 */
  label: string | null;
  /** IP 的哈希（不存原文）：用于发现"一个来源键后面藏着多个 IP" */
  ipHash: string | null;
  /** 该来源出现在哪些上报里（界面上的「来源」列直接显示它） */
  userAgent: string | null;
}

/** 请求里与"谁在报"有关的几个取值；由 HTTP 层提取后传进来，便于单测 */
export interface SourceHints {
  /** 自报安装 ID（请求头 x-collector-source 或上报体 sourceId） */
  reported?: string | null;
  /** 客户端 IP（已由 HTTP 层从 x-forwarded-for / socket 解析） */
  ip?: string | null;
  /** User-Agent 原文 */
  userAgent?: string | null;
  /** 客户端版本（老契约的 clientVersion），只用于展示 */
  clientVersion?: string | null;
}

/** 自报 ID 的长度上限：足够放 UUID/机器码，又不至于让人往里塞说明文字 */
const MAX_REPORTED_LENGTH = 128;

function shortHash(input: string, length = 32): string {
  return createHash('sha256').update(input).digest('hex').slice(0, length);
}

/**
 * 把请求特征解析成一个来源身份。
 *
 * 纯函数（不碰数据库、不读请求对象），因此可以在单测里直接喂参数验证
 * "带 ID 的优先""只带 IP 也认得出""什么都没有则为 none"这几种情形。
 */
export function resolveSourceIdentity(hints: SourceHints): SourceIdentity {
  const reported = (hints.reported ?? '').trim();
  const ip = (hints.ip ?? '').trim();
  const userAgent = (hints.userAgent ?? '').trim() || null;

  if (reported.length > 0) {
    if (reported.length > MAX_REPORTED_LENGTH) {
      throw badRequest(
        'source.idTooLong',
        `自报来源 ID 太长：${reported.length} 字符（上限 ${MAX_REPORTED_LENGTH}）`,
      );
    }
    return {
      key: `r:${shortHash(`reported\u0001${reported}`)}`,
      kind: 'reported',
      // 展示名取前 8 位：既能对上人，又不至于把整个机器码铺在界面上
      label: `自报 ${reported.slice(0, 8)}`,
      ipHash: ip ? shortHash(`ip\u0001${ip}`) : null,
      userAgent,
    };
  }

  if (ip) {
    const fingerprint = shortHash(`ipua\u0001${ip}\u0001${userAgent ?? ''}`);
    return {
      key: `f:${fingerprint}`,
      kind: 'fingerprint',
      label: `IP ${maskIp(ip)}`,
      ipHash: shortHash(`ip\u0001${ip}`),
      userAgent,
    };
  }

  // 既没有自报 ID 也没有 IP：只能当无身份处理（只入审计、不投票）。
  // 这种情形在生产里应该不会出现（HTTP 层总能拿到 socket 地址），
  // 但测试与内部调用会走到，必须有个明确结果而不是抛错。
  return { key: null, kind: 'none', label: null, ipHash: null, userAgent };
}

/** IP 打码：只在日志/界面上显示前两段，避免把完整地址铺出去 */
function maskIp(ip: string): string {
  if (ip.includes(':')) {
    const parts = ip.split(':').filter(Boolean);
    return `${parts.slice(0, 2).join(':')}::`;
  }
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
  return ip;
}

/** 指纹来源是否允许投票（可通过环境变量关掉，见 env.source.fingerprintVotes） */
export function sourceCanVote(identity: SourceIdentity): boolean {
  if (identity.key === null) return false;
  if (identity.kind === 'fingerprint') return env.source.fingerprintVotes;
  return true;
}

/**
 * 从请求里取出"谁在报"的几个特征。
 *
 * IP 的取法跟随限流中间件的口径（`x-forwarded-for` 可配），这样"限流看到的来源"
 * 与"投票看到的来源"是同一个 —— 否则运维按 IP 找问题时会看到两个不同的答案。
 *
 * 自报 ID 有三条来源，按可信度排序：请求头 `x-collector-source`、
 * 上报体里的 `sourceId`、查询参数 `source`（便于用 curl 手工验证）。
 */
export function sourceHintsFrom(event: H3Event, body?: Record<string, unknown>): SourceHints {
  const headerId = (getHeader(event, 'x-collector-source') ?? '').trim();
  const bodyId = typeof body?.sourceId === 'string' ? body.sourceId.trim() : '';
  const queryId = (getQuery(event).source ?? '') as string;
  const reported = headerId !== '' ? headerId : bodyId !== '' ? bodyId : String(queryId).trim();

  const ip = getRequestIP(event, { xForwardedFor: env.source.trustProxy }) ?? '';
  const userAgent = (getHeader(event, 'user-agent') ?? '').trim();

  return { reported, ip, userAgent };
}
