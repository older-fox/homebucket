import { apiHandler, readJsonBody } from '../../utils/http';
import { parseLogin } from '../../dto/auth';
import { AuthService } from '../../services/auth.service';
import { FixedWindowRateLimiter } from '../../utils/rate-limit';
import { env } from '../../utils/env';
import { setSessionCookie } from '../../utils/auth';

/**
 * `POST /api/admin/login` —— 账号口令换一个会话 cookie。
 *
 * 登录接口单独限流：全局那层限流对 /api/admin 是跳过的（管理接口不该被限），
 * 但"猜口令"必须有额度，否则一个脚本可以无限次尝试。
 * 按来源 IP 计数，默认 10 次 / 10 分钟（COLLECTOR_LOGIN_RATE_LIMIT 可调）。
 */
const limiter = new FixedWindowRateLimiter(env.loginRateLimit, env.loginRateWindowMs);

export default defineEventHandler(
  apiHandler(async (event) => {
    // 猜口令的限流键同样只在可信代理后才取 X-Forwarded-For，否则攻击者每次
    // 换一个伪造头就绕过了限流（见 middleware/20.rate-limit.ts 的同一处说明）。
    const ip = getRequestIP(event, { xForwardedFor: env.source.trustProxy }) ?? 'unknown';
    const decision = limiter.hit(ip);
    setResponseHeader(event, 'x-ratelimit-limit', decision.limit);
    setResponseHeader(event, 'x-ratelimit-remaining', decision.remaining);
    if (!decision.allowed) {
      setResponseHeader(event, 'retry-after', decision.retryAfterSeconds);
      setResponseStatus(event, 429);
      // 与全局限流中间件逐字同形状（code=rate.tooMany + retryAfterSeconds），前端一套处理
      return {
        statusCode: 429,
        code: 'rate.tooMany',
        message: `登录尝试过于频繁，请 ${decision.retryAfterSeconds} 秒后重试`,
        retryAfterSeconds: decision.retryAfterSeconds,
      };
    }

    const dto = parseLogin(await readJsonBody<Record<string, unknown>>(event));
    const userAgent = getRequestHeader(event, 'user-agent') ?? null;
    const result = await new AuthService().login(dto.username, dto.password, userAgent);

    setSessionCookie(event, result.token, Math.round(env.sessionTtlHours * 3600));
    return { ok: true, user: result.user, expiresAt: result.expiresAt };
  }),
);
