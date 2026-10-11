import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FixedWindowRateLimiter } from '../server/utils/rate-limit.ts';

test('固定窗口：额度内放行，超出拒绝并给出 Retry-After', () => {
  const limiter = new FixedWindowRateLimiter(2, 60_000, () => 1_000);
  const first = limiter.hit('1.2.3.4');
  assert.deepEqual(
    { allowed: first.allowed, limit: first.limit, remaining: first.remaining },
    { allowed: true, limit: 2, remaining: 1 },
  );
  assert.equal(limiter.hit('1.2.3.4').allowed, true);
  const blocked = limiter.hit('1.2.3.4');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterSeconds, 59);
});

test('固定窗口：换窗口就重新计数', () => {
  let now = 0;
  const limiter = new FixedWindowRateLimiter(1, 1_000, () => now);
  assert.equal(limiter.hit('a').allowed, true);
  assert.equal(limiter.hit('a').allowed, false);
  now = 1_000;
  assert.equal(limiter.hit('a').allowed, true, '新窗口重新给额度');
});

test('固定窗口：不同来源各算各的，额度互不挤占', () => {
  const limiter = new FixedWindowRateLimiter(1, 1_000, () => 0);
  assert.equal(limiter.hit('a').allowed, true);
  assert.equal(limiter.hit('b').allowed, true);
  assert.equal(limiter.hit('a').allowed, false);
  assert.equal(limiter.size(), 2);
});

test('固定窗口：过期的桶会被顺手清掉（不给扫描器留无限内存）', () => {
  let now = 0;
  const limiter = new FixedWindowRateLimiter(10, 1_000, () => now);
  for (let i = 0; i < 200; i += 1) limiter.hit(`ip-${i}`);
  assert.equal(limiter.size(), 200);
  now = 5_000;
  // 每 256 次命中清一次过期桶：这里打满一轮
  for (let i = 0; i < 256; i += 1) limiter.hit('sweeper');
  assert.ok(limiter.size() <= 60, `清理后应该只剩新窗口的桶，实际 ${limiter.size()}`);
});
