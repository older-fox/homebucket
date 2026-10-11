import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFieldSources, payloadFields } from '../server/utils/provenance.ts';
import type { ItemFields } from '../server/utils/identity.ts';

const state: ItemFields = {
  name: '冲击钻',
  model: 'X1',
  manufacturer: 'Bosch',
  category: null,
  baseUnit: null,
  description: null,
  imageUrls: ['https://a.example/1.jpg'],
  attributes: { 电压: '18V' },
};

const contributions = [
  {
    id: 1,
    instanceId: 1,
    instanceName: '家A',
    source: 'api',
    observedAt: '2026-01-01T00:00:00.000Z',
    payload: JSON.stringify({ name: '电钻', model: 'X0' }),
    blocked: false,
  },
  {
    id: 2,
    instanceId: 2,
    instanceName: '家B',
    source: 'api',
    observedAt: '2026-02-01T00:00:00.000Z',
    payload: JSON.stringify({
      name: '电钻',
      model: 'X1',
      imageUrls: ['https://a.example/1.jpg'],
      attributes: { 电压: '18V' },
    }),
    blocked: false,
  },
  {
    id: 3,
    instanceId: 1,
    instanceName: '家A',
    source: 'api',
    observedAt: '2026-03-01T00:00:00.000Z',
    payload: JSON.stringify({ name: '冲击钻' }),
    blocked: false,
  },
  {
    id: 4,
    instanceId: 3,
    instanceName: '刷数据的',
    source: 'api',
    observedAt: '2026-04-01T00:00:00.000Z',
    payload: JSON.stringify({ name: '垃圾数据', category: '假分类' }),
    blocked: true,
  },
  {
    id: 5,
    instanceId: null,
    instanceName: null,
    source: 'admin',
    observedAt: '2026-05-01T00:00:00.000Z',
    payload: JSON.stringify({ manufacturer: 'Bosch' }),
    blocked: false,
  },
];

test('来源审计：每个字段指到"给出当前值的那条未屏蔽上报"', () => {
  const sources = buildFieldSources(state, ['name'], contributions);
  const byField = new Map(sources.map((source) => [source.field, source]));

  const name = byField.get('name');
  assert.equal(name?.value, '冲击钻');
  assert.equal(name?.contributionId, 3, '当前值来自最新那条报了同值的上报');
  assert.equal(name?.instanceName, '家A');
  assert.equal(name?.locked, true, '人工锁定的字段要标出来');
  assert.equal(name?.agreedBy, 1);

  const model = byField.get('model');
  assert.equal(model?.value, 'X1');
  assert.equal(model?.contributionId, 2, '更早的 X0 不参与');

  const manufacturer = byField.get('manufacturer');
  assert.equal(manufacturer?.source, 'admin');
  assert.equal(manufacturer?.instanceName, null, '人工纠错没有实例归属');

  assert.equal(byField.get('imageUrls')?.value, 'https://a.example/1.jpg');
  assert.equal(byField.get('attributes.电压')?.value, '18V');
});

test('来源审计：被屏蔽的上报既不进值也不进来源，字段顺序稳定', () => {
  const sources = buildFieldSources(state, [], contributions);
  const serialized = JSON.stringify(sources);
  assert.equal(serialized.includes('垃圾数据'), false);
  assert.equal(serialized.includes('假分类'), false);
  assert.equal(
    sources.some((source) => source.field === 'category'),
    false,
    '没有值也没有来源的字段不出现在审计里',
  );

  const order = sources.map((source) => source.field);
  const expected = ['name', 'model', 'manufacturer', 'imageUrls', 'attributes.电压'];
  assert.deepEqual(order, expected, '单值字段 → 图片 → 扩展属性');
});

test('来源审计：锁定但已被清空的字段仍然要出现在台面上', () => {
  const cleared = { ...state, manufacturer: null };
  const sources = buildFieldSources(cleared, ['manufacturer'], []);
  const manufacturer = sources.find((source) => source.field === 'manufacturer');
  assert.equal(manufacturer?.value, null);
  assert.equal(manufacturer?.contributionId, null);
  assert.equal(manufacturer?.locked, true, '锁了但没有值，管理员要能看到它被锁着');
});

test('payloadFields：取上报 payload 里的字段名（审计展示用）', () => {
  assert.deepEqual(payloadFields('{"name":"电钻","model":"X1"}'), ['model', 'name']);
  assert.deepEqual(payloadFields('不是 JSON'), []);
});
