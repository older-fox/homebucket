import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { boot, fakeWebDir, removeDir } from './helpers/boot.mjs';

/**
 * HTTP 外壳：同进程托管前端（SPA 回退）、跨域、以及"按来源 IP 的总额度"限流。
 * 这几件事都发生在 Nest 路由之外，所以单独一个文件测。
 */

let ctx;
let webDir;

before(async () => {
  webDir = fakeWebDir();
  ctx = await boot({ webDir, rateLimit: 5 });
});

after(async () => {
  await ctx.close();
  removeDir(webDir);
});

test('同进程托管：根路径返回前端页面', async () => {
  const res = await ctx.inject({ method: 'GET', url: '/' });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(res.body, /collector-spa/);
});

test('SPA 回退：前端路由直接刷新也能打开', async () => {
  for (const url of ['/items/6901234567892', '/admin', '/audit']) {
    const res = await ctx.inject({ method: 'GET', url });
    assert.equal(res.statusCode, 200, `${url} 应该回 index.html`);
    assert.match(res.body, /collector-spa/);
  }
});

test('静态资源按原样返回（不走 SPA 回退）', async () => {
  const res = await ctx.inject({ method: 'GET', url: '/assets/app.js' });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /collector/);
  assert.match(res.headers['content-type'], /javascript/);
});

test('接口拼错：/api/** 回 JSON 404 而不是 HTML', async () => {
  const res = await ctx.inject({ method: 'GET', url: '/api/v1/nope' });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().code, 'route.notFound');
  assert.match(res.headers['content-type'], /application\/json/);
});

test('对前端的写请求也回 JSON 404（前端只有 GET 页面）', async () => {
  const res = await ctx.inject({ method: 'POST', url: '/items/1' });
  assert.equal(res.statusCode, 404);
  // 非 GET 不归兜底路由管，走 Nest 自己的未命中处理 —— 同样是 JSON，不会吐 HTML
  assert.match(res.headers['content-type'], /application\/json/);
  assert.equal(res.json().statusCode, 404);
});

test('跨域：默认放开任何来源，预检直接 204', async () => {
  const preflight = await ctx.inject({
    method: 'OPTIONS',
    url: '/api/v1/contributions',
    headers: { origin: 'https://ha.example', 'access-control-request-method': 'POST' },
  });
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers['access-control-allow-origin'], '*');
  assert.match(preflight.headers['access-control-allow-headers'], /x-collector-key/);

  const actual = await ctx.inject({
    method: 'GET',
    url: '/api/health',
    headers: { origin: 'https://ha.example' },
  });
  assert.equal(actual.statusCode, 200);
  assert.equal(actual.headers['access-control-allow-origin'], '*');
});

test('限流：按来源 IP 的总额度算（查询/上报共用一份预算）', async () => {
  const codes = [];
  // 用一个没被前面用例用过的来源 IP，保证额度是从零开始数的
  const remoteAddress = '203.0.113.7';
  for (let i = 0; i < 6; i += 1) {
    const res = await ctx.inject({ method: 'GET', url: '/api/health', remoteAddress });
    codes.push(res.statusCode);
    if (res.statusCode === 429) {
      assert.equal(res.json().code, 'rate.tooMany');
      assert.equal(res.headers['retry-after'], String(res.json().retryAfterSeconds));
      assert.equal(res.headers['x-ratelimit-remaining'], '0');
    } else {
      assert.match(res.headers['x-ratelimit-limit'], /^\d+$/);
    }
  }
  assert.deepEqual(codes.slice(0, 5), [200, 200, 200, 200, 200]);
  assert.equal(codes[5], 429, '第 6 次应当被拒（额度 5）');
});
