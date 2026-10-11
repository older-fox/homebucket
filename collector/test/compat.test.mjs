import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { boot } from './helpers/boot.mjs';

/**
 * 互操作层：主仓库**已经部署出去**的实例客户端只会发这两个请求，而且不带身份。
 *
 *   GET  {endpoint}/barcodes/:code   （200 = 收录，404 = 未收录）
 *   POST {endpoint}/observations     （2xx = 收到）
 *
 * 这个文件就是那份契约的回归测试：形状、状态码、匿名上报的可审计性、
 * 以及"匿名不等于无敌"（管理员仍能屏蔽单条、锁死字段）。
 */

let ctx;
const BARCODE = '6901234567890';

const lookup = (code = BARCODE) =>
  ctx.inject({ method: 'GET', url: `/api/v1/barcodes/${code}` });

const observe = (payload) =>
  ctx.inject({ method: 'POST', url: '/api/v1/observations', payload });

before(async () => {
  ctx = await boot();
});

after(async () => {
  await ctx.close();
});

test('老契约·查询：未收录的条码回 404 item.notFound（实例据此不自动填充）', async () => {
  const res = await lookup('NOT-COLLECTED-0001');
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().code, 'item.notFound');
});

test('老契约·上报：匿名上报被接受，并按条码建档', async () => {
  const res = await observe({
    barcode: BARCODE,
    name: 'AA battery',
    manufacturer: 'Nanfu',
    model: 'alkaline',
    category: 'battery',
    clientVersion: 'homebucket/1',
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  assert.equal(body.accepted, true);
  assert.equal(body.created, true);
  assert.deepEqual(body.applied.sort(), ['category', 'manufacturer', 'model', 'name']);
  assert.ok(Number.isInteger(body.contributionId));
});

test('老契约·查询：收录后返回 RemoteProduct 形状（含 confidence/sources/imageUrl）', async () => {
  const res = await lookup();
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.barcode, BARCODE);
  assert.equal(body.name, 'AA battery');
  assert.equal(body.manufacturer, 'Nanfu');
  assert.equal(body.model, 'alkaline');
  assert.equal(body.category, 'battery');
  assert.equal(body.imageUrl, null, '没有图片时是 null，不是空数组');
  // 独苗上报只给 0.5：收集器的价值在多来源互相印证，单条不该被标成 100%
  assert.equal(body.confidence, 0.5);
  assert.equal(body.sources, 1);
  // 契约之外的补充字段：老客户端忽略，收集器自己的前端可以直接用
  assert.equal(body.description, null);
  assert.deepEqual(body.attributes, {});
  assert.match(body.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('老契约·上报：第二个实例报同样的值，置信度上升', async () => {
  const res = await observe({
    barcode: BARCODE,
    name: 'AA battery',
    manufacturer: 'Nanfu',
    clientVersion: 'homebucket/1',
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().created, false);

  const body = (await lookup()).json();
  assert.equal(body.sources, 2);
  assert.equal(body.confidence, 0.67, '2 票一致 → 2/3');
});

test('老契约·上报：值不一致时仍是最新观测胜出，但置信度被拉低', async () => {
  const res = await observe({
    barcode: BARCODE,
    name: 'AA battery (LR6)',
    clientVersion: 'homebucket/1',
  });
  assert.equal(res.statusCode, 200);

  const body = (await lookup()).json();
  assert.equal(body.name, 'AA battery (LR6)', '新值覆盖旧值');
  assert.equal(body.sources, 3);
  assert.equal(body.confidence, 0.25, '3 票里只有 1 票与当前值一致 → 1/4');
});

test('匿名上报也进审计：instanceId 为 null、来源是 api', async () => {
  const res = await ctx.inject({
    method: 'GET',
    url: `/api/v1/items/${BARCODE}/contributions`,
  });
  assert.equal(res.statusCode, 200);
  const rows = res.json().contributions;
  assert.equal(rows.length, 3);
  assert.equal(rows[0].instanceId, null);
  assert.equal(rows[0].instanceName, null);
  assert.equal(rows[0].source, 'api');
  assert.deepEqual(rows[0].payload.name, 'AA battery (LR6)');
});

test('老契约·上报：缺条码 400 validation.failed，条码格式非法 400 contribution.barcodeInvalid', async () => {
  const missing = await observe({ name: '没有条码' });
  assert.equal(missing.statusCode, 400);
  assert.equal(missing.json().code, 'validation.failed');

  const invalid = await observe({ barcode: 'ab', name: '太短' });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().code, 'contribution.barcodeInvalid');
});

test('匿名不等于无敌：管理员屏蔽某条匿名上报后它不再算数', async () => {
  const audit = await ctx.asAdmin({ method: 'GET', url: '/api/admin/contributions?source=api' });
  assert.equal(audit.statusCode, 200);
  const newest = audit.json().contributions.find((row) => row.instanceId === null);
  assert.ok(newest, '应该能按 source=api 筛出匿名上报');

  const blocked = await ctx.asAdmin({
    method: 'POST',
    url: `/api/admin/contributions/${newest.id}/block`,
    payload: { blocked: true, reason: '测试屏蔽' },
  });
  assert.equal(blocked.statusCode, 200, blocked.body);

  const body = (await lookup()).json();
  assert.equal(body.sources, 2, '被屏蔽的上报不计入来源数');
  assert.equal(body.name, 'AA battery', '字段回退到上一条未被屏蔽的观测');
  assert.equal(body.confidence, 0.67);
});

test('管理员锁定字段后，匿名上报改不动它', async () => {
  assert.equal((await lookup()).json().name, 'AA battery', '锁定前是上一条未被屏蔽的观测值');

  const listed = await ctx.asAdmin({ method: 'GET', url: `/api/admin/items?q=${BARCODE}` });
  const id = listed.json().items.find((row) => row.barcode === BARCODE).id;
  assert.ok(id);

  const patched = await ctx.asAdmin({
    method: 'PATCH',
    url: `/api/admin/items/${id}`,
    payload: { name: '南孚 5 号电池', lockedFields: ['name'] },
  });
  assert.equal(patched.statusCode, 200, patched.body);
  // PATCH 的响应是 { item: <详情>, applied: [改动的字段] }
  assert.equal(patched.json().item.name, '南孚 5 号电池');
  assert.deepEqual(patched.json().applied, ['name']);

  const res = await observe({ barcode: BARCODE, name: '又改一次' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().applied, [], '锁定字段跳过自动上报');
  assert.equal((await lookup()).json().name, '南孚 5 号电池');
});

test('互操作层不动收集器自己的 v1 协议：老契约上报仍然要能被 v1 详情页看到来源', async () => {
  const res = await ctx.inject({ method: 'GET', url: `/api/v1/items/${BARCODE}` });
  assert.equal(res.statusCode, 200);
  const detail = res.json();
  assert.equal(detail.lockedFields.includes('name'), true);

  // 厂商这一票是匿名上报给的：source=api 且没有实例 id（前端把它显示成"未知来源"）
  const manufacturer = detail.fields.find((field) => field.field === 'manufacturer');
  assert.equal(manufacturer.value, 'Nanfu');
  assert.equal(manufacturer.source, 'api');
  assert.equal(manufacturer.instanceId, null);
  assert.equal(manufacturer.instanceName, null);

  // 名称被管理员改过并锁死：接口回的是机器可读的 source='admin'，中文标签由前端渲染
  const nameField = detail.fields.find((field) => field.field === 'name');
  assert.equal(nameField.value, '南孚 5 号电池');
  assert.equal(nameField.locked, true);
  assert.equal(nameField.source, 'admin');
});

test('老契约·条码回显：带连字符的写法原样返回，且与归一化写法是同一个条目', async () => {
  // 已经部署出去的实例可能拿 remote.barcode 跟自己的扫码结果比对、或直接落进本地数据，
  // 所以老契约回显"请求里的写法"；归一化只用于判定身份 —— 两种写法必须落到同一条目上。
  const hyphenated = 'BOSCH-GSB18V55';
  const res = await observe({
    barcode: hyphenated,
    name: 'Cordless Hammer Drill GSB 18V-55',
    manufacturer: 'Bosch',
  });
  assert.equal(res.statusCode, 200, res.body);

  const echoed = (await lookup(hyphenated)).json();
  assert.equal(echoed.barcode, hyphenated, '回显请求里的写法，不是库里的归一化条码');
  assert.equal(echoed.name, 'Cordless Hammer Drill GSB 18V-55');

  const normalized = (await lookup('BOSCHGSB18V55')).json();
  assert.equal(normalized.name, 'Cordless Hammer Drill GSB 18V-55', '两种写法查到同一个条目');
  assert.equal(normalized.sources, 1, '不应因为写法不同而多出一票');

  // 收集器自己的 v1 协议暴露的是规范化身份（前端据此跳详情页）
  const detail = await ctx.inject({ method: 'GET', url: '/api/v1/items/BOSCH-GSB18V55' });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().barcode, 'BOSCHGSB18V55');
});
