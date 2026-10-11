import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 端到端测试的起停脚手架。
 *
 * 两个要点：
 * 1. **必须在 import dist 之前设好 process.env** —— `config/env.ts` 在模块加载时就把
 *    环境读成常量了，晚一步设置就等于没设。所以这里用动态 import。
 * 2. 每个测试文件在 node --test 下是独立进程，因此每个文件可以有自己的库与配置，
 *    互不干扰（这也是 node:test 的好处，不用手写清理）。
 */

const distRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');

/** 造一个只提供 API 的实例（没有前端产物，走的是"只提供 API"的分支） */
export async function boot(options = {}) {
  const {
    adminToken = 'test-admin-token',
    registrationOpen = true,
    rateLimit = 10000,
    webDir = null,
  } = options;

  const dir = mkdtempSync(join(tmpdir(), 'hbcol-test-'));
  process.env.NODE_ENV = 'test';
  process.env.COLLECTOR_ADMIN_TOKEN = adminToken;
  process.env.COLLECTOR_REGISTRATION_OPEN = String(registrationOpen);
  process.env.COLLECTOR_DB_FILE_PATH = join(dir, 'collector.db');
  process.env.COLLECTOR_AUTO_MIGRATE = 'true';
  process.env.COLLECTOR_RATE_LIMIT = String(rateLimit);
  process.env.COLLECTOR_API_PREFIX = 'api';
  if (webDir === null) {
    process.env.COLLECTOR_WEB_DIR = join(dir, 'no-web');
  } else {
    process.env.COLLECTOR_WEB_DIR = webDir;
  }

  const { createApp } = await import(join(distRoot, 'app.factory.js'));
  const app = await createApp();
  const fastify = app.getHttpAdapter().getInstance();

  return {
    app,
    fastify,
    adminToken,
    /** 打一个请求（不占端口，用 fastify 的 inject） */
    inject: (opts) => fastify.inject(opts),
    /** 带实例 key 的请求 */
    asInstance: (key, opts) =>
      fastify.inject({
        ...opts,
        headers: { ...(opts.headers ?? {}), 'x-collector-key': key },
      }),
    /** 带管理令牌的请求 */
    asAdmin: (opts) =>
      fastify.inject({
        ...opts,
        headers: { ...(opts.headers ?? {}), 'x-admin-token': adminToken },
      }),
    async close() {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** 造一个假的"前端构建产物"，用来测同进程托管与 SPA 回退 */
export function fakeWebDir() {
  const dir = mkdtempSync(join(tmpdir(), 'hbcol-web-'));
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><html><body><div id="app">collector-spa</div></body></html>',
    'utf8',
  );
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("collector");', 'utf8');
  return dir;
}

export function removeDir(dir) {
  rmSync(dir, { recursive: true, force: true });
}
