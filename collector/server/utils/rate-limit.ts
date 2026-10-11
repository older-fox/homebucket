/**
 * 固定窗口限流（进程内）。
 *
 * ── 为什么不用 @nestjs/throttler ──
 * 它按"每个路由 + 每个 IP"分别计数，而我们要的是**每个来源 IP 的总额度**：
 * 查询、注册、上报共用一份预算，否则刷查询接口不影响上报额度，等于没限。
 * 另外这里刻意做成纯内存、可预测的实现 —— 收集器是单节点服务，多节点部署时
 * 限流本来就该放在网关，假装进程内计数是全局额度反而更危险。
 */
export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** 建议的 Retry-After（秒，向上取整，至少 1） */
  retryAfterSeconds: number;
}

interface Bucket {
  windowStart: number;
  count: number;
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private hits = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    /** 注入时钟，只给单测用 */
    private readonly now: () => number = Date.now,
  ) {}

  hit(key: string): RateLimitDecision {
    const now = this.now();
    // 窗口对齐到 windowMs 的整数倍：所有 key 共享同一批窗口起点，
    // 过期判断因此退化成一次 windowStart 比较，不需要定时器
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const bucket = this.buckets.get(key);
    const current: Bucket =
      bucket === undefined || bucket.windowStart !== windowStart
        ? { windowStart, count: 0 }
        : bucket;
    current.count += 1;
    this.buckets.set(key, current);
    this.maybeSweep(windowStart);

    return {
      allowed: current.count <= this.limit,
      limit: this.limit,
      remaining: Math.max(0, this.limit - current.count),
      retryAfterSeconds: Math.max(1, Math.ceil((windowStart + this.windowMs - now) / 1000)),
    };
  }

  /** 当前跟踪的 key 数量（测试与诊断用） */
  size(): number {
    return this.buckets.size;
  }

  /**
   * 顺手清理过期的桶：每 256 次命中清一次。
   * 既不引入定时器，也不会让 Map 随着扫描器不断换 IP 无限增长。
   */
  private maybeSweep(currentWindowStart: number): void {
    this.hits += 1;
    if (this.hits % 256 !== 0) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.windowStart < currentWindowStart) this.buckets.delete(key);
    }
  }
}
