import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
  // 带内容 hash 的产物目录可以放心长缓存
  assert.equal(res.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(res.headers['content-length'], String(Buffer.byteLength(res.body)));
});

test('启动后新增的产物文件也能立刻服务（构建换 hash 不必重启）', async () => {
  // 这条是回归护栏：@fastify/static 的 wildcard:false 模式在启动时 glob 文件表，
  // 重新构建（emptyOutDir + 新 hash 文件名）之后新文件会落到兜底路由上，
  // 于是浏览器拿到 text/html 的 JS 并报 MIME 错误。自己读磁盘就没这个问题。
  writeFileSync(join(webDir, 'assets', 'index-dCzUwFL5.js'), 'console.log("new bundle");', 'utf8');
  const res = await ctx.inject({ method: 'GET', url: '/assets/index-dCzUwFL5.js' });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /javascript/);
  assert.match(res.body, /new bundle/);
});

test('文件不存在的资源请求回 JSON 404，不会拿 index.html 糊弄', async () => {
  const res = await ctx.inject({ method: 'GET', url: '/assets/missing-abc123.js' });
  assert.equal(res.statusCode, 404);
  assert.match(res.headers['content-type'], /application\/json/);
  assert.equal(res.json().code, 'route.notFound');
});

test('目录穿越拿不到静态根目录之外的文件', async () => {
  const res = await ctx.inject({
    method: 'GET',
    url: '/assets/%2e%2e%2f%2e%2e%2fpackage.json',
  });
  assert.notEqual(res.statusCode, 200);
  assert.doesNotMatch(res.body, /homebucket-collector/);
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
