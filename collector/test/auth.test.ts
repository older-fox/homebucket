import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { closeDatabase, initDatabase } from '../server/database/db.ts';
import { AuthService } from '../server/services/auth.service.ts';
import { adminSessionsRepo, adminUsersRepo } from '../server/services/repositories.ts';
import { env } from '../server/utils/env.ts';
import {
  SESSION_COOKIE,
  hashPassword,
  newSessionToken,
  sessionTokenHash,
  verifyPassword,
} from '../server/utils/auth.ts';
import { isoNow } from '../server/utils/time.ts';

/**
 * 鉴权层单测。
 *
 * 这里刻意**不 mock 数据库**：会话与账号的全部逻辑就是几条 SQL 的语义
 * （唯一约束、过期比较、按 tokenHash 删除），mock 掉之后测的只是"我调用了那个方法"。
 * 每个测试文件在 node --test 下是独立进程，所以这里用临时库 + 进程级单例连接很安全。
 */

let dir = '';
let service: AuthService;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'hbcol-auth-'));
  await initDatabase({ database: join(dir, 'auth.db'), migrate: true, log: () => {} });
  service = new AuthService();
});

after(async () => {
  await closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

test('口令哈希：格式自带参数、盐每次不同、坏数据只返回 false 不抛', () => {
  const hash = hashPassword('correct horse battery staple');
  assert.match(hash, /^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.equal(verifyPassword('correct horse battery staple', hash), true);
  assert.equal(verifyPassword('wrong', hash), false);
  // 同一口令两次哈希必须不同（盐随机），否则等于把"两个人用了同一个口令"写在脸上
  assert.notEqual(hashPassword('same'), hashPassword('same'));

  for (const bad of ['', 'not-a-hash', 'scrypt$16384$8$1$onlyfiveparts', 'bcrypt$16384$8$1$aa$bb', null, undefined]) {
    assert.equal(verifyPassword('x', bad), false);
  }
  // 参数越界/非 2 的幂：拒绝而不是拿去做内存爆炸的 scrypt
  assert.equal(verifyPassword('x', 'scrypt$3$8$1$YWJj$ZGVm'), false);
  assert.equal(verifyPassword('x', 'scrypt$1024$99$1$YWJj$ZGVm'), false);
  // 参数被合法升级过（这里用 N=4096 的旧参数手搓一条）也要能校验通过 ——
  // 这是以后调 scrypt 参数时不锁死已有账号的前提（校验读存储串里的参数，不读当前常量）
  const legacyN = 4096;
  const salt = randomBytes(16);
  const legacyHash = scryptSync('legacy-pass', salt, 32, {
    N: legacyN,
    r: 8,
    p: 1,
    maxmem: 128 * legacyN * 8 * 2,
  });
  const older = `scrypt$${legacyN}$8$1$${salt.toString('base64')}$${legacyHash.toString('base64')}`;
  assert.equal(verifyPassword('legacy-pass', older), true);
  assert.equal(verifyPassword('wrong', older), false);
});

test('会话令牌：hbs_ 前缀 + 40 位 hex，库里只存 sha256', () => {
  const token = newSessionToken();
  assert.match(token, /^hbs_[0-9a-f]{40}$/);
  assert.notEqual(newSessionToken(), token);
  assert.match(sessionTokenHash(token), /^[0-9a-f]{64}$/);
  assert.equal(sessionTokenHash(token), sessionTokenHash(token));
  assert.notEqual(sessionTokenHash(token), sessionTokenHash(newSessionToken()));
  assert.equal(SESSION_COOKIE, 'hb_collector_session');
});

test('bootstrapAdmin：首次按 .env 建号，之后不覆盖已改过的口令', async () => {
  const first = await service.bootstrapAdmin();
  assert.equal(first.created, true);
  assert.equal(first.username, env.admin.username);

  // 幂等：第二次什么都不做
  const second = await service.bootstrapAdmin();
  assert.deepEqual(second, { created: false, reset: false, username: env.admin.username });

  const users = adminUsersRepo();
  assert.equal(await users.count(), 1);
  const row = await users.findOneOrFail({ where: { username: env.admin.username } });
  assert.equal(verifyPassword(env.admin.password, row.passwordHash), true);

  // 管理员在界面上改了密码后，重启（= 再跑一次引导）不能把口令改回 .env 里的值
  const login = await service.login(env.admin.username, env.admin.password, 'node-test');
  await service.changePassword(await service.verify(login.token), env.admin.password, 'brand-new-password');
  const third = await service.bootstrapAdmin();
  assert.equal(third.created, false);
  const after = await users.findOneOrFail({ where: { username: env.admin.username } });
  assert.equal(verifyPassword('brand-new-password', after.passwordHash), true);
  assert.equal(verifyPassword(env.admin.password, after.passwordHash), false);

  // 复位回 .env 的口令，后面的用例继续用 env.admin.password 登录
  const back = await service.login(env.admin.username, 'brand-new-password', 'node-test');
  await service.changePassword(await service.verify(back.token), 'brand-new-password', env.admin.password);
});

test('login/verify/logout：失败码、过期码、幂等退出', async () => {
  const ok = await service.login(env.admin.username, env.admin.password, 'node-test/1.0');
  assert.equal(ok.user.username, env.admin.username);
  assert.match(ok.token, /^hbs_/);
  assert.ok(Date.parse(ok.expiresAt) > Date.now());

  // 错口令与"用户不存在"必须是同一个 code（不给账号枚举留接口）
  for (const [username, password] of [
    [env.admin.username, 'definitely-wrong'],
    ['nobody-here', 'definitely-wrong'],
  ]) {
    await assert.rejects(
      () => service.login(username, password, null),
      (error: { code?: string; statusCode?: number }) => {
        assert.equal(error.code, 'admin.badCredentials');
        assert.equal(error.statusCode, 401);
        return true;
      },
    );
  }

  const context = await service.verify(ok.token);
  assert.equal(context.user.id, ok.user.id);
  assert.equal(context.tokenHash, sessionTokenHash(ok.token));

  // 未知令牌 → sessionInvalid
  await assert.rejects(
    () => service.verify(newSessionToken()),
    (error: { code?: string }) => error.code === 'admin.sessionInvalid',
  );

  // 过期会话：直接塞一条过期时间在过去的行 → sessionExpired，且该行被顺手删掉
  const expiredToken = newSessionToken();
  await adminSessionsRepo().save({
    tokenHash: sessionTokenHash(expiredToken),
    adminUserId: ok.user.id,
    expiresAt: new Date(Date.now() - 1000).toISOString(),
    lastUsedAt: null,
    userAgent: null,
  });
  await assert.rejects(
    () => service.verify(expiredToken),
    (error: { code?: string }) => error.code === 'admin.sessionExpired',
  );
  assert.equal(await adminSessionsRepo().count({ where: { tokenHash: sessionTokenHash(expiredToken) } }), 0);

  assert.deepEqual(await service.logout(ok.token), { revoked: true });
  await assert.rejects(
    () => service.verify(ok.token),
    (error: { code?: string }) => error.code === 'admin.sessionInvalid',
  );
  // 再退一次：幂等，不抛
  assert.deepEqual(await service.logout(ok.token), { revoked: false });
});

test('changePassword：错旧密码/与旧密码相同都拒绝，成功后只保留当前会话', async () => {
  // 从干净的会话表开始：不然"吊销了几条"要减去前面用例留下的会话，断言会变成算数题
  await adminSessionsRepo().clear();
  const a = await service.login(env.admin.username, env.admin.password, 'node-test/A');
  const b = await service.login(env.admin.username, env.admin.password, 'node-test/B');
  const contextA = await service.verify(a.token);

  await assert.rejects(
    () => service.changePassword(contextA, 'not-the-current-one', 'another-long-password'),
    (error: { code?: string; statusCode?: number }) => {
      assert.equal(error.code, 'admin.badCurrentPassword');
      assert.equal(error.statusCode, 400);
      return true;
    },
  );
  await assert.rejects(
    () => service.changePassword(contextA, env.admin.password, env.admin.password),
    (error: { code?: string }) => error.code === 'admin.passwordUnchanged',
  );
  // 失败后口令没变
  await service.login(env.admin.username, env.admin.password, null);

  try {
    const before = await adminSessionsRepo().count({ where: { adminUserId: contextA.user.id } });
    const result = await service.changePassword(contextA, env.admin.password, 'rotated-password-1');
    assert.equal(result.user.username, env.admin.username);
    assert.equal(result.revokedSessions, before - 1, '除当前会话外的会话应被吊销');

    // 会话 A 仍然可用，B 已失效
    assert.equal((await service.verify(a.token)).user.username, env.admin.username);
    await assert.rejects(
      () => service.verify(b.token),
      (error: { code?: string }) => error.code === 'admin.sessionInvalid',
    );
    // 新口令可登录、旧口令不可
    await service.login(env.admin.username, 'rotated-password-1', null);
    await assert.rejects(
      () => service.login(env.admin.username, env.admin.password, null),
      (error: { code?: string }) => error.code === 'admin.badCredentials',
    );
  } finally {
    // 无论断言成败都把口令复位回 env.admin.password：后面的用例都拿它登录
    const token = (await service.login(env.admin.username, 'rotated-password-1', null)).token;
    await service.changePassword(await service.verify(token), 'rotated-password-1', env.admin.password);
  }
});

test('forceReset：用 .env 的口令重置并作废全部会话', async () => {
  const session = await service.login(env.admin.username, env.admin.password, 'node-test/reset');
  await service.changePassword(await service.verify(session.token), env.admin.password, 'temp-password-x');
  const live = await service.login(env.admin.username, 'temp-password-x', null);

  // env 是 `as const` 的对象，运行期只是普通对象；这里模拟"运维把 FORCE_RESET 打开后重启"
  const original = env.adminForceReset;
  (env as { adminForceReset: boolean }).adminForceReset = true;
  try {
    const result = await service.bootstrapAdmin();
    assert.equal(result.reset, true);
    assert.equal(result.username, env.admin.username);
  } finally {
    (env as { adminForceReset: boolean }).adminForceReset = original;
  }

  // 复位把全部会话都作废了（连刚才那条也一起）——先验空表，再登录
  assert.equal(await adminSessionsRepo().count(), 0);
  await assert.rejects(
    () => service.verify(live.token),
    (error: { code?: string }) => error.code === 'admin.sessionInvalid',
  );

  // 口令回到 .env 的值
  await service.login(env.admin.username, env.admin.password, null);
  await assert.rejects(
    () => service.login(env.admin.username, 'temp-password-x', null),
    (error: { code?: string }) => error.code === 'admin.badCredentials',
  );
});

test('purgeExpiredSessions：只删过期的，返回删除条数', async () => {
  await adminSessionsRepo().clear();
  const user = await adminUsersRepo().findOneOrFail({ where: { username: env.admin.username } });
  const now = Date.now();
  await adminSessionsRepo().save([
    {
      tokenHash: sessionTokenHash(newSessionToken()),
      adminUserId: user.id,
      expiresAt: new Date(now - 60_000).toISOString(),
      lastUsedAt: null,
      userAgent: null,
    },
    {
      tokenHash: sessionTokenHash(newSessionToken()),
      adminUserId: user.id,
      expiresAt: new Date(now + 60_000).toISOString(),
      lastUsedAt: null,
      userAgent: null,
    },
  ]);
  assert.equal(await service.purgeExpiredSessions(isoNow()), 1);
  assert.equal(await adminSessionsRepo().count(), 1);
});
