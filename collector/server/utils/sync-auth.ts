// `getHeader` 必须**显式导入**：Nitro 的自动导入只在服务端运行时生效，
// 而 utils/ 会被单测直接 import（node --test 下没有自动导入）。
// 漏掉它不会在 build 时报错，只会在跑测试时变成 `ReferenceError: getHeader is not defined`
// —— 一个本该 401 的鉴权失败会以 500 收场。utils/ 里一律显式导入 h3。
import { getHeader, type H3Event } from 'h3';
import { unauthorized } from './http';
import { env } from './env';

/**
 * 出站同步导出接口的公共鉴权。
 *
 * ── 为什么不复用管理端会话 ──
 * 调用方是**对方系统**（服务器到服务器）：它没有浏览器，也不该拿管理员的账号口令 ——
 * 那样对方一旦被攻破，等于把纠错台一起交出去。所以走 `COLLECTOR_SYNC_TOKEN`（Bearer），
 * 权限只到"能不能读导出数据"这一件事。
 *
 * ── 为什么不配令牌时放行 ──
 * 导出接口带着全库资料。"默认开放 + 反正在内网"是把网络位置当安全边界，
 * 而收集器自己的前提就是"所有实例都能上报"，从不假设内网可信。宁可让人
 * 配一次令牌，也不要留一个默认敞开的全量导出。
 */
export function requireSyncToken(event: H3Event): void {
  const expected = env.sync.token;
  if (!expected) {
    throw unauthorized(
      'sync.tokenNotConfigured',
      '导出接口未启用：服务端没有配置 COLLECTOR_SYNC_TOKEN',
    );
  }
  const provided =
    bearerOf(event) ?? String(getHeader(event, 'x-collector-sync-token') ?? '').trim();
  if (!provided || provided !== expected) {
    throw unauthorized('sync.tokenInvalid', '同步令牌不正确');
  }
}

/** 读 `Authorization: Bearer <token>`；没有或格式不对返回 null */
function bearerOf(event: H3Event): string | null {
  const header = String(getHeader(event, 'authorization') ?? '').trim();
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() ?? null;
}
