import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isAbsolute } from 'node:path';

import {
  DEV_ADMIN_TOKEN,
  adminTokenOf,
  packageVersion,
  parseBool,
  parseCorsOrigin,
  parseDbProvider,
  parseIntIn,
  parseSize,
  resolveDataFile,
  resolveWebDir,
} from '../dist/config/env.js';

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

test('数据文件与前端目录：相对路径按服务根目录解析，绝对路径原样', () => {
  const root = '/srv/collector';
  assert.equal(resolveDataFile('data/collector.db', root), '/srv/collector/data/collector.db');
  assert.equal(resolveDataFile(undefined, root), '/srv/collector/data/collector.db');
  assert.equal(resolveDataFile('/tmp/x.db', root), '/tmp/x.db');
  assert.equal(isAbsolute(resolveDataFile('a.db', root)), true);
  assert.equal(resolveWebDir(undefined, root), '/srv/collector/public');
  assert.equal(resolveWebDir('public', root), '/srv/collector/public');
  assert.equal(resolveWebDir('/var/www/collector', root), '/var/www/collector');
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

test('管理令牌：生产缺了就不让启动，开发回退到固定值', () => {
  assert.equal(adminTokenOf('production', 'a-long-enough-token'), 'a-long-enough-token');
  assert.throws(() => adminTokenOf('production', undefined), /COLLECTOR_ADMIN_TOKEN/);
  assert.throws(() => adminTokenOf('production', 'short'), /COLLECTOR_ADMIN_TOKEN/);
  assert.equal(adminTokenOf('development', undefined), DEV_ADMIN_TOKEN);
  assert.equal(adminTokenOf('development', 'dev-token-2'), 'dev-token-2');
});

test('CORS：默认全开，收紧时解析成白名单', () => {
  assert.equal(parseCorsOrigin(undefined), '*');
  assert.equal(parseCorsOrigin('*'), '*');
  assert.deepEqual(parseCorsOrigin('https://a.example, https://b.example'), [
    'https://a.example',
    'https://b.example',
  ]);
});
