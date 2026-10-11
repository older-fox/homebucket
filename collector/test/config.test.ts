import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isAbsolute } from 'node:path';

import {
  DEV_ADMIN_PASSWORD,
  DEV_ADMIN_USERNAME,
  MIN_ADMIN_PASSWORD_LENGTH,
  adminCredentialsOf,
  packageVersion,
  parseBool,
  parseCorsOrigin,
  parseDbProvider,
  parseIntIn,
  parseSize,
  resolveDataFile,
  sessionTtlHoursOf,
} from '../server/utils/env.ts';

test('布尔解析：只有显式的真假词才算数，其余回退默认值', () => {
  for (const yes of ['1', 'true', 'TRUE', 'yes', 'on', ' on ']) {
    assert.equal(parseBool(yes, false), true);
  }
  for (const no of ['0', 'false', 'No', 'off']) {
    assert.equal(parseBool(no, true), false);
  }
  assert.equal(parseBool(undefined, true), true);
  assert.equal(parseBool('', true), true);
  assert.equal(parseBool('maybe', false), false);
});

test('整数解析：非数字与越界一律回退，不抛错', () => {
  assert.equal(parseIntIn('8080', 3400, 1, 65535), 8080);
  assert.equal(parseIntIn('abc', 3400, 1, 65535), 3400);
  assert.equal(parseIntIn('0', 3400, 1, 65535), 3400);
  assert.equal(parseIntIn('70000', 3400, 1, 65535), 3400);
  assert.equal(parseIntIn('12.5', 3400, 1, 65535), 3400);
  assert.equal(parseIntIn(undefined, 3400, 1, 65535), 3400);
});

test('体积解析：b/kb/mb/gb 都认，读不懂回退', () => {
  assert.equal(parseSize('64kb', 1), 64 * 1024);
  assert.equal(parseSize('64KB', 1), 64 * 1024);
  assert.equal(parseSize('1mb', 1), 1024 * 1024);
  assert.equal(parseSize('2g', 1), 2 * 1024 * 1024 * 1024);
  assert.equal(parseSize('2048', 1), 2048);
  assert.equal(parseSize('大量', 4096), 4096);
});

test('数据库方言：v1 只认 sqlite，别的直接抛错（不静默降级）', () => {
  assert.equal(parseDbProvider('sqlite'), 'sqlite');
  assert.equal(parseDbProvider(undefined), 'sqlite');
  assert.throws(() => parseDbProvider('mysql'), /sqlite/);
  assert.throws(() => parseDbProvider('postgres'), /sqlite/);
});

test('数据文件：相对路径按服务根目录解析，绝对路径原样', () => {
  const root = '/srv/collector';
  assert.equal(resolveDataFile('data/collector.db', root), '/srv/collector/data/collector.db');
  assert.equal(resolveDataFile(undefined, root), '/srv/collector/data/collector.db');
  assert.equal(resolveDataFile('/tmp/x.db', root), '/tmp/x.db');
  assert.equal(isAbsolute(resolveDataFile('a.db', root)), true);
});

test('版本号：npm 注入优先，否则读 package.json', () => {
  const before = process.env.npm_package_version;
  try {
    delete process.env.npm_package_version;
    const fromPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
    assert.equal(packageVersion(), fromPackage);
    process.env.npm_package_version = '9.9.9-test';
    assert.equal(packageVersion(), '9.9.9-test');
  } finally {
    if (before === undefined) delete process.env.npm_package_version;
    else process.env.npm_package_version = before;
  }
});

test('管理员账号：生产缺口令不让启动，开发回退到固定默认值', () => {
  assert.deepEqual(adminCredentialsOf('production', 'ops', 'a-long-enough-password'), {
    username: 'ops',
    password: 'a-long-enough-password',
  });
  assert.throws(() => adminCredentialsOf('production', 'ops', undefined), /COLLECTOR_ADMIN_PASSWORD/);
  assert.throws(() => adminCredentialsOf('production', 'ops', ''), /COLLECTOR_ADMIN_PASSWORD/);
  assert.deepEqual(adminCredentialsOf('development', undefined, undefined), {
    username: DEV_ADMIN_USERNAME,
    password: DEV_ADMIN_PASSWORD,
  });
  // 口令短于下限：任何环境都拒绝（弱口令不该因为"这是开发环境"就放行）
  assert.throws(() => adminCredentialsOf('development', 'admin', 'short'), /至少/);
  assert.ok(DEV_ADMIN_PASSWORD.length >= MIN_ADMIN_PASSWORD_LENGTH);
});

test('管理员账号：口令不做 trim，账号名有格式约束', () => {
  // 前后空格是口令的一部分：悄悄裁掉会让"配了同一个密码却登不上"变成无解排查
  assert.deepEqual(adminCredentialsOf('development', 'admin', '  spaced-pass  '), {
    username: 'admin',
    password: '  spaced-pass  ',
  });
  // 账号名两侧空格可以裁（人写 .env 时很容易多打一个空格）
  assert.equal(adminCredentialsOf('development', ' ops ', 'a-long-enough-password').username, 'ops');
  for (const bad of ['a', '带中文', 'has space', '-leading', 'x'.repeat(33)]) {
    assert.throws(() => adminCredentialsOf('development', bad, 'a-long-enough-password'), /COLLECTOR_ADMIN_USERNAME/);
  }
});

test('会话有效期：默认 7 天，越界或读不懂回退', () => {
  assert.equal(sessionTtlHoursOf(undefined), 168);
  assert.equal(sessionTtlHoursOf('24'), 24);
  assert.equal(sessionTtlHoursOf('0'), 168);
  assert.equal(sessionTtlHoursOf('99999'), 168);
  assert.equal(sessionTtlHoursOf('7.5'), 168);
});

test('CORS：默认全开，收紧时解析成白名单', () => {
  assert.equal(parseCorsOrigin(undefined), '*');
  assert.equal(parseCorsOrigin('*'), '*');
  assert.deepEqual(parseCorsOrigin('https://a.example, https://b.example'), [
    'https://a.example',
    'https://b.example',
  ]);
});
