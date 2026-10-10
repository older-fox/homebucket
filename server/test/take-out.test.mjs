/**
 * 「取走 / 放回」状态机的纯逻辑测试。
 *
 * 覆盖 server/src/scan/take-out.ts：哪些目标能取走、放回时时间戳必须清空、记哪条历史。
 * 服务层（scan.service.ts）依赖 6 个 Repository + 装饰器，跑不进零依赖的 node:test，
 * 所以把这三条规则抽成纯函数单独测；服务与历史动作注册表的一致性用源码级断言兜住。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const {
  isTakeable,
  notTakeableMessage,
  takeOutAction,
  nextTakenOutAt,
} = await import('../src/scan/take-out.ts');

const here = dirname(fileURLToPath(import.meta.url));

test('只有整件物品与 SN 能取走，位置和模板不行', () => {
  assert.equal(isTakeable('item'), true);
  assert.equal(isTakeable('unit'), true);
  assert.equal(isTakeable('location'), false);
  assert.equal(isTakeable('template'), false);
  assert.equal(isTakeable(''), false);
  assert.equal(isTakeable('ITEM'), false, '类型是枚举式小写字符串，不做大小写兼容');
});

test('不能取走时的兜底消息按类型区分', () => {
  assert.equal(notTakeableMessage('location'), '位置不能取走');
  assert.equal(notTakeableMessage('template'), '模板不能取走');
  // 只有位置/模板会被调用，但传别的类型也不能抛
  assert.equal(typeof notTakeableMessage('item'), 'string');
});

test('取走记 take_out、放回记 put_back', () => {
  assert.equal(takeOutAction(true), 'item.take_out');
  assert.equal(takeOutAction(false), 'item.put_back');
});

test('取走写当下时间；放回一定清成 null', () => {
  const now = new Date('2026-10-10T08:00:00.000Z');
  assert.equal(nextTakenOutAt(true, now), now);
  assert.equal(nextTakenOutAt(false, now), null);
  // 不传 now 时也得是 Date（服务里就是不带参数调用）
  const fresh = nextTakenOutAt(true);
  assert.ok(fresh instanceof Date);
  assert.ok(Math.abs(Date.now() - fresh.getTime()) < 5000);
});

test('取走/放回的动作名必须真的在历史动作注册表里', () => {
  // 源码级断言：take-out.ts 刻意不 import activity.service（那边带装饰器，会破坏零依赖），
  // 所以两个字符串是各写一份的；这里保证它们没有漂移。
  const source = readFileSync(join(here, '../src/activity/activity.service.ts'), 'utf8');
  const registry = source.slice(
    source.indexOf('export const ACTIVITY_ACTIONS'),
    source.indexOf('] as const;'),
  );
  for (const action of [takeOutAction(true), takeOutAction(false)]) {
    assert.ok(registry.includes(`'${action}'`), `${action} 不在 ACTIVITY_ACTIONS 里`);
  }
  // 反过来的哨兵：注册表里这两个动作必须是取走/放回，而不是被挪去别处
  assert.ok(registry.includes("'item.take_out'"));
  assert.ok(registry.includes("'item.put_back'"));
});

test('服务层用上了这些纯函数（回归护栏：别又写回内联三元）', () => {
  const source = readFileSync(join(here, '../src/scan/scan.service.ts'), 'utf8');
  for (const fn of ['isTakeable(', 'notTakeableMessage(', 'takeOutAction(', 'nextTakenOutAt(']) {
    assert.ok(source.includes(fn), `scan.service.ts 没有调用 ${fn}`);
  }
  assert.ok(
    !/takenOut \? new Date\(\) : null/.test(source),
    '时间戳逻辑不该再内联在服务里',
  );
});
