import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BARCODE_PATTERN,
  MAX_ATTRIBUTES,
  MAX_IMAGE_URLS,
  contentHashOf,
  emptyFields,
  fingerprintOf,
  identityKeyOf,
  mergeItemFields,
  normalizeBarcode,
  normalizeFields,
  parseAttributes,
  parseImageUrls,
} from '../server/utils/identity.ts';

test('条码归一化：去空格/连字符 + 大写，读不懂就返回 null', () => {
  assert.equal(normalizeBarcode(' 690-1234 567892 '), '6901234567892');
  assert.equal(normalizeBarcode('abc123'), 'ABC123');
  assert.equal(normalizeBarcode('   '), null);
  assert.equal(normalizeBarcode(undefined), null);
  assert.equal(normalizeBarcode(12345), null);
});

test('条码格式：EAN/UPC 与 Code128 常见写法都放行，太短/带斜杠的拒绝', () => {
  for (const ok of ['6901234567892', 'ABC-123', 'hb_0001', 'X1.B2']) {
    assert.equal(BARCODE_PATTERN.test(ok), true, `${ok} 应该通过`);
  }
  for (const bad of ['123', '-ABC', 'abc/def', 'a b c d', '']) {
    assert.equal(BARCODE_PATTERN.test(bad), false, `${bad} 应该被拒`);
  }
});

test('图片地址：只收 http(s)、去重、截断超长、限制条数', () => {
  const urls = parseImageUrls([
    'https://a.example/1.jpg',
    'http://b.example/2.jpg',
    'https://a.example/1.jpg',
    'ftp://c.example/3.jpg',
    'not-a-url',
    'javascript:alert(1)',
    `https://d.example/${'x'.repeat(600)}.jpg`,
  ]);
  assert.deepEqual(urls, ['https://a.example/1.jpg', 'http://b.example/2.jpg']);

  const many = Array.from({ length: 30 }, (_, i) => `https://e.example/${i}.jpg`);
  assert.equal(parseImageUrls(many).length, MAX_IMAGE_URLS);
  assert.deepEqual(parseImageUrls('不是数组'), []);
});

test('扩展属性：值转字符串、键/值截断、空值丢弃、限制条数', () => {
  const attrs = parseAttributes({ 电压: '18V', 重量: 1.2, 空: '', ['k'.repeat(60)]: 'v' });
  assert.equal(attrs['电压'], '18V');
  assert.equal(attrs['重量'], '1.2', '数字值转成字符串');
  assert.equal(attrs['空'], undefined, '空值不入库');
  assert.equal('k'.repeat(60) in attrs, false, '超长键截断后再入库');
  assert.equal(attrs['k'.repeat(40)], 'v');
  assert.equal(Object.keys(attrs).length, 3);

  const many = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, `v${i}`]));
  assert.equal(Object.keys(parseAttributes(many)).length, MAX_ATTRIBUTES);
  assert.deepEqual(parseAttributes(null), {});
});

test('字段归一化：trim + 按列长截断', () => {
  const fields = normalizeFields({ name: `  ${'名'.repeat(300)}  `, baseUnit: '  件 ' });
  assert.equal(fields.name.length, 200);
  assert.equal(fields.baseUnit, '件');
  assert.equal(fields.model, null);
});

test('指纹：大小写/多空格不影响，三项全空返回 null', () => {
  const a = fingerprintOf({ name: 'Drill  X1', model: 'MOD-1', manufacturer: 'Bosch' });
  const b = fingerprintOf({ name: 'drill x1', model: 'mod-1', manufacturer: 'bosch' });
  assert.equal(a, b);
  assert.equal(fingerprintOf({ name: '  ' }), null);
  assert.equal(identityKeyOf(null, emptyFields()), null);
  assert.equal(identityKeyOf('6901234567892', emptyFields()), 'barcode:6901234567892');
  assert.match(identityKeyOf(null, { name: '电钻' }), /^fingerprint:[0-9a-f]{64}$/);
});

test('内容指纹与键顺序无关，值变了就变', () => {
  const one = contentHashOf('ABC', normalizeFields({ attributes: { a: '1', b: '2' } }));
  const two = contentHashOf('ABC', normalizeFields({ attributes: { b: '2', a: '1' } }));
  const three = contentHashOf('ABC', normalizeFields({ attributes: { a: '1', b: '3' } }));
  assert.equal(one, two);
  assert.notEqual(one, three);
});

test('合并：新的非空观测胜出，旧的不覆盖，空值不算观测', () => {
  const first = mergeItemFields(emptyFields(), {}, { name: '电钻', model: 'X1' }, {
    observedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.deepEqual(first.applied, ['name', 'model']);
  assert.equal(first.next.name, '电钻');

  const newer = mergeItemFields(first.next, first.fieldUpdatedAt, { name: '冲击钻' }, {
    observedAt: '2026-02-01T00:00:00.000Z',
  });
  assert.equal(newer.next.name, '冲击钻');
  assert.equal(newer.next.model, 'X1', '没提到的字段保持原值');

  const older = mergeItemFields(newer.next, newer.fieldUpdatedAt, { name: '手电钻' }, {
    observedAt: '2025-12-01T00:00:00.000Z',
  });
  assert.equal(older.next.name, '冲击钻', '更早的观测不能覆盖');
  assert.deepEqual(older.applied, []);

  const blank = mergeItemFields(older.next, older.fieldUpdatedAt, { name: null, model: '' }, {
    observedAt: '2026-03-01T00:00:00.000Z',
  });
  assert.equal(blank.next.name, '冲击钻');
  assert.equal(blank.next.model, 'X1');
  assert.deepEqual(blank.applied, [], '自动上报里的空值只是"这次没观测到"');
});

test('合并：时间相同时后来者胜（同一次批量里的后一条为准）', () => {
  const at = '2026-01-01T00:00:00.000Z';
  const one = mergeItemFields(emptyFields(), {}, { name: 'A' }, { observedAt: at });
  const two = mergeItemFields(one.next, one.fieldUpdatedAt, { name: 'B' }, { observedAt: at });
  assert.equal(two.next.name, 'B');
  assert.deepEqual(two.applied, ['name']);
});

test('合并：锁定的字段跳过，没锁的照改', () => {
  const base = mergeItemFields(emptyFields(), {}, { name: '人工确认', model: 'X1' }, {
    observedAt: '2026-01-01T00:00:00.000Z',
  });
  const locked = mergeItemFields(base.next, base.fieldUpdatedAt, { name: '别人报的', category: '工具' }, {
    observedAt: '2026-06-01T00:00:00.000Z',
    lockedFields: ['name'],
  });
  assert.equal(locked.next.name, '人工确认');
  assert.equal(locked.next.category, '工具');
  assert.deepEqual(locked.applied, ['category']);
});

test('合并：图片累加、属性逐个 key 竞争', () => {
  const one = mergeItemFields(
    emptyFields(),
    {},
    { imageUrls: ['https://a/1.jpg'], attributes: { 颜色: '红', 电压: '18V' } },
    { observedAt: '2026-01-01T00:00:00.000Z' },
  );
  const two = mergeItemFields(one.next, one.fieldUpdatedAt, {
    imageUrls: ['https://a/1.jpg', 'https://a/2.jpg'],
    attributes: { 颜色: '蓝', 电池: '2.0Ah' },
  }, { observedAt: '2026-02-01T00:00:00.000Z' });

  assert.deepEqual(two.next.imageUrls, ['https://a/1.jpg', 'https://a/2.jpg']);
  assert.equal(two.next.attributes['颜色'], '蓝');
  assert.equal(two.next.attributes['电压'], '18V', '没被提到的属性保留');
  assert.equal(two.next.attributes['电池'], '2.0Ah');
  assert.deepEqual(two.applied.sort(), ['attributes.电池', 'attributes.颜色', 'imageUrls']);
});

test('合并：值没变时只推进时间，不算改动', () => {
  const one = mergeItemFields(emptyFields(), {}, { name: '电钻' }, {
    observedAt: '2026-01-01T00:00:00.000Z',
  });
  const same = mergeItemFields(one.next, one.fieldUpdatedAt, { name: '电钻' }, {
    observedAt: '2026-02-01T00:00:00.000Z',
  });
  assert.deepEqual(same.applied, []);
  assert.equal(same.fieldUpdatedAt.name, '2026-02-01T00:00:00.000Z', '最后观测时间要往前走');
});

test('合并：explicitNullFields（人工纠错）能清空字段并抹掉写入时间', () => {
  const base = mergeItemFields(emptyFields(), {}, { model: 'X1', name: '电钻' }, {
    observedAt: '2026-01-01T00:00:00.000Z',
  });
  const cleared = mergeItemFields(base.next, base.fieldUpdatedAt, { model: null }, {
    observedAt: '2026-02-01T00:00:00.000Z',
    explicitNullFields: ['model'],
  });
  assert.equal(cleared.next.model, null);
  assert.equal(cleared.next.name, '电钻');
  assert.deepEqual(cleared.applied, ['model']);
  assert.equal('model' in cleared.fieldUpdatedAt, false, '抹掉时间，之后自动上报可以重新填上');

  const notListed = mergeItemFields(base.next, base.fieldUpdatedAt, { model: null, name: null }, {
    observedAt: '2026-02-01T00:00:00.000Z',
    explicitNullFields: ['model'],
  });
  assert.equal(notListed.next.name, '电钻', '没在清空列表里的字段不受 null 影响');
});
