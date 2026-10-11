import { FixedWindowRateLimiter } from '../utils/rate-limit';
import { env } from '../utils/env';

/**
 * 按来源 IP 的固定窗口限流（进程内），取代旧 Nest 的全局 RateLimitGuard。
 *
 * 三处与旧实现对齐的细节，别"顺手优化"掉：
 *  1. **查询/注册/上报共用一份预算**（都按 IP 计数）。分开计数只会让刷量者
 *     用三倍预算达成同样效果。
 *  2. **管理接口完全不限流**（旧代码用 @SkipRateLimit 标注）。管理接口已经有
 *     admin token 这道门，再限流只会在运维批量纠错时咬到自己。
 *  3. 命中与否都回 `x-ratelimit-limit` / `x-ratelimit-remaining`，超限时额外回
 *     `retry-after`，并且错误体里带 `retryAfterSeconds`（前端要拿它说人话）。
 *
 * 限流器实例放模块作用域：Node 单进程里模块只会被求值一次，等价于旧实现的单例 provider。
 */
const limiter = new FixedWindowRateLimiter(env.rateLimit, env.rateWindowMs);

export default defineEventHandler((event) => {
  const path = event.path;
  if (!path.startsWith('/api/')) return;
  if (path.startsWith('/api/admin')) return;

  // 部署在 nginx/cloudflare 后面时必须信 X-Forwarded-For，否则所有实例共用一个额度
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown';
  const decision = limiter.hit(ip);

  setResponseHeader(event, 'x-ratelimit-limit', decision.limit);
  setResponseHeader(event, 'x-ratelimit-remaining', decision.remaining);
  if (decision.allowed) return;

  setResponseHeader(event, 'retry-after', decision.retryAfterSeconds);
  setResponseStatus(event, 429);
  return {
    statusCode: 429,
    code: 'rate.tooMany',
    message: `请求过于频繁，请 ${decision.retryAfterSeconds} 秒后重试`,
    retryAfterSeconds: decision.retryAfterSeconds,
  };
});
