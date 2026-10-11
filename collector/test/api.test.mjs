import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { boot } from './helpers/boot.mjs';

/**
 * 端到端：把"实例注册 → 上报 → 公共查询 → 人工纠错 → 审计 → 统计"整条链路走一遍。
 * 全程用 fastify 的 inject()，不占端口。
 */

let ctx;
let A;
let B;
let C;
const BARCODE = '6901234567892';
// 注意：条码在服务端会被归一化（去掉连字符并大写），所以这里直接用归一化后的形式，
// 否则 admin 列表用 q=HBMERGE 搜不到（库里存的是 HBMERGE0001）
const MERGE_SOURCE = 'HBMERGE0001';
const MERGE_TARGET = 'HBMERGE0002';

const contribute = (key, payload) =>
  ctx.asInstance(key, { method: 'POST', url: '/api/v1/contributions', payload });

const itemOf = async (barcode) => {
  const res = await ctx.inject({ method: 'GET', url: `/api/v1/items/${barcode}` });
  return res;
};

before(async () => {
  ctx = await boot();
  const names = ['家A', '家B', '刷数据的'];
  const keys = [];
  for (const name of names) {
    const res = await ctx.inject({
      method: 'POST',
      url: '/api/v1/instances',
      payload: { name, platform: 'linux', version: '0.1.0' },
    });
    assert.equal(res.statusCode, 201, `注册 ${name} 失败：${res.body}`);
    keys.push(res.json().key);
  }
  [A, B, C] = keys;
});

after(async () => {
  await ctx.close();
});

test('健康检查：报出服务名、注册开关与库存量', async () => {
  const res = await ctx.inject({ method: 'GET', url: '/api/health' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'homebucket-collector');
  assert.equal(body.registrationOpen, true);
  assert.equal(body.storage.provider, 'sqlite');
  assert.equal(body.storage.instances, 3, '夹具里注册了 3 个实例');
});

test('实例注册：key 只在注册时返回一次，库里只存哈希', async () => {
  const res = await ctx.inject({
    method: 'POST',
    url: '/api/v1/instances',
    payload: { name: '临时实例' },
  });
  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.match(body.key, /^hbc_[0-9a-f]{40}$/);
  assert.equal(body.keyPrefix, body.key.slice(0, 12));
  assert.ok(body.note.includes('唯一一次'));

  const me = await ctx.asInstance(body.key, { method: 'GET', url: '/api/v1/instances/me' });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().name, '临时实例');
  assert.equal(me.json().keyPrefix, body.keyPrefix);
  assert.equal('key' in me.json(), false, '自查不会再把明文吐出来');
});

test('上报要带 key，缺了/错了都 401', async () => {
  const missing = await ctx.inject({
    method: 'POST',
    url: '/api/v1/contributions',
    payload: { barcode: BARCODE, name: '电钻' },
  });
  assert.equal(missing.statusCode, 401);
  assert.equal(missing.json().code, 'instance.keyMissing');

  const invalid = await contribute('hbc_' + '0'.repeat(40), { barcode: BARCODE, name: '电钻' });
  assert.equal(invalid.statusCode, 401);
  assert.equal(invalid.json().code, 'instance.keyInvalid');
});

test('第一次上报：建档 + 字段全部入库，返回改动清单', async () => {
  const res = await contribute(A, {
    barcode: '690-1234 567892',
    name: '电钻',
    model: 'GSB 18V',
    manufacturer: 'Bosch',
    category: '电动工具',
    baseUnit: '台',
    imageUrls: ['https://img.example/drill.jpg'],
    attributes: { 电压: '18V' },
    observedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(res.statusCode, 201, res.body);
  const body = res.json();
  assert.equal(body.created, true);
  assert.equal(body.item.barcode, BARCODE, '条码要归一化成大写无连字符');
  assert.equal(body.item.name, '电钻');
  assert.deepEqual(body.applied.sort(), [
    'attributes.电压',
    'baseUnit',
    'category',
    'imageUrls',
    'manufacturer',
    'model',
    'name',
  ]);
});

test('公共详情：字段值 + 每个字段的来源（谁报的）', async () => {
  const res = await itemOf(BARCODE);
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.name, '电钻');
  assert.equal(body.attributes['电压'], '18V');
  const name = body.fields.find((field) => field.field === 'name');
  assert.equal(name.value, '电钻');
  assert.equal(name.instanceName, '家A');
  assert.equal(name.source, 'api');
  assert.equal(name.agreedBy, 1);
});

test('第二个实例报同一个条码：更新的观测胜出，旧的字段保留', async () => {
  const res = await contribute(B, {
    barcode: BARCODE,
    name: '冲击钻',
    barcodeDuplicate: undefined,
    observedAt: '2026-02-01T00:00:00.000Z',
  });
  assert.equal(res.statusCode, 201, res.body);
  assert.deepEqual(res.json().applied, ['name'], '只有 name 变了');

  const detail = (await itemOf(BARCODE)).json();
  assert.equal(detail.name, '冲击钻');
  assert.equal(detail.manufacturer, 'Bosch', '别人没提到的字段保持原值');
  assert.equal(detail.instanceCount, 2);
});

test('更早的观测不能覆盖新值（历史数据补报不会把资料改回去）', async () => {
  const res = await contribute(A, {
    barcode: BARCODE,
    name: '手电钻',
    category: '五金',
    observedAt: '2025-12-01T00:00:00.000Z',
  });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.json().applied, [], '两个字段都已经有更新的观测了');
  const detail = (await itemOf(BARCODE)).json();
  assert.equal(detail.name, '冲击钻', '名字保持家B那次');
  assert.equal(detail.category, '电动工具', '分类保持第一次上报的值');
});

test('未来的观测时间会被夹回当下（防止有人用未来时间永久霸占字段）', async () => {
  const res = await contribute(A, {
    barcode: BARCODE,
    description: '2999 年的人写的',
    observedAt: '2999-01-01T00:00:00.000Z',
  });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.json().applied, ['description']);

  // 夹回当下之后，稍后的一次上报（不传 observedAt，服务端盖当下时间）就能覆盖它 ——
  // 这正是夹回的意义：未来时间不能变成"永久霸占"
  const later = await contribute(B, { barcode: BARCODE, description: '现在写的' });
  assert.deepEqual(later.json().applied, ['description'], '夹回当下之后仍可被更新的观测覆盖');
  assert.equal((await itemOf(BARCODE)).json().description, '现在写的');
});

test('上报校验：坏条码 400、没有身份信息 400、缺名字 400', async () => {
  // DTO 只管长度，条码字符集由服务层的 BARCODE_PATTERN 把关（归一化之后再判）
  const badBarcode = await contribute(A, { barcode: '###', name: '电钻' });
  assert.equal(badBarcode.statusCode, 400, badBarcode.body);
  assert.equal(badBarcode.json().code, 'contribution.barcodeInvalid');

  const noIdentity = await contribute(A, { attributes: { 电压: '18V' } });
  assert.equal(noIdentity.statusCode, 400);
  assert.equal(noIdentity.json().code, 'contribution.identityMissing');

  const noName = await ctx.inject({
    method: 'POST',
    url: '/api/v1/instances',
    payload: { name: '' },
  });
  assert.equal(noName.statusCode, 400);
  assert.equal(noName.json().code, 'validation.failed');
});

test('无条码物品：按「名称+型号+制造商」指纹建档并可搜索', async () => {
  const res = await contribute(B, {
    name: '路由器',
    model: 'AX3000',
    manufacturer: 'TP-Link',
    category: '网络',
    observedAt: '2026-03-01T00:00:00.000Z',
  });
  assert.equal(res.statusCode, 201, res.body);
  const body = res.json();
  assert.equal(body.created, true);
  assert.equal(body.item.barcode, null);
  assert.match(body.item.identityKey, /^fingerprint:[0-9a-f]{64}$/);

  const search = await ctx.inject({ method: 'GET', url: '/api/v1/items?q=路由器' });
  assert.equal(search.statusCode, 200);
  assert.equal(search.json().total, 1);
  assert.equal(search.json().items[0].name, '路由器');
});

test('搜索：条码/名称/型号/制造商都能命中，分页参数被钳制', async () => {
  const byBarcode = await ctx.inject({ method: 'GET', url: `/api/v1/items?q=${BARCODE}` });
  assert.equal(byBarcode.json().total, 1);

  const byModel = await ctx.inject({ method: 'GET', url: '/api/v1/items?q=ax3000' });
  assert.equal(byModel.json().total, 1, '搜索不区分大小写');

  const all = await ctx.inject({ method: 'GET', url: '/api/v1/items?pageSize=99999' });
  assert.equal(all.statusCode, 200);
  assert.equal(all.json().pageSize, 100, '越界的分页参数钳到上限而不是报错');
});

test('上报记录：谁在什么时候改了什么', async () => {
  const res = await ctx.inject({
    method: 'GET',
    url: `/api/v1/items/${BARCODE}/contributions?pageSize=50`,
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.total >= 5);
  const first = body.contributions[0];
  assert.equal(typeof first.instanceName, 'string');
  assert.equal(first.source, 'api');
  assert.ok(Array.isArray(first.appliedFields));
  const byB = body.contributions.find(
    (entry) => entry.instanceName === '家B' && entry.payload.name !== null,
  );
  assert.ok(byB, '家B 的上报也要在记录里');
  assert.equal(byB.payload.name, '冲击钻');
});

test('管理员令牌：没有/错的令牌都 401，正确的能开会话', async () => {
  const missing = await ctx.inject({ method: 'GET', url: '/api/admin/session' });
  assert.equal(missing.statusCode, 401);
  assert.equal(missing.json().code, 'admin.tokenMissing');

  const invalid = await ctx.inject({
    method: 'GET',
    url: '/api/admin/session',
    headers: { 'x-admin-token': 'wrong-token-123' },
  });
  assert.equal(invalid.statusCode, 401);
  assert.equal(invalid.json().code, 'admin.tokenInvalid');

  const ok = await ctx.asAdmin({ method: 'GET', url: '/api/admin/session' });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().ok, true);
  assert.equal(ok.json().registrationOpen, true);
});

test('纠错台：人工改字段并锁定，之后自动上报改不动它', async () => {
  const detail = (await itemOf(BARCODE)).json();
  const patched = await ctx.asAdmin({
    method: 'PATCH',
    url: `/api/admin/items/${detail.id}`,
    payload: { name: '冲击钻（人工确认）', lockedFields: ['name'], note: '与说明书核对过' },
  });
  assert.equal(patched.statusCode, 200, patched.body);
  assert.equal(patched.json().item.name, '冲击钻（人工确认）');
  assert.deepEqual(patched.json().item.lockedFields, ['name']);

  const after = await contribute(C, {
    barcode: BARCODE,
    name: '冲击钻',
    observedAt: '2026-07-01T00:00:00.000Z',
  });
  assert.equal(after.statusCode, 201);
  assert.deepEqual(after.json().applied, [], '锁定的字段拒绝自动改写');
  assert.equal((await itemOf(BARCODE)).json().name, '冲击钻（人工确认）');

  const provenance = (await itemOf(BARCODE)).json().fields.find((f) => f.field === 'name');
  assert.equal(provenance.locked, true);
  assert.equal(provenance.source, 'admin');
});

test('纠错台：清空字段（人工纠错里的 null 是"删掉这个值"）', async () => {
  const detail = (await itemOf(BARCODE)).json();
  const cleared = await ctx.asAdmin({
    method: 'PATCH',
    url: `/api/admin/items/${detail.id}`,
    payload: { clearFields: ['category'] },
  });
  assert.equal(cleared.statusCode, 200, cleared.body);
  assert.equal(cleared.json().item.category, null);
  assert.equal(cleared.json().applied.includes('category'), true);

  const reReported = await contribute(B, {
    barcode: BARCODE,
    category: '电动工具',
    observedAt: '2026-08-01T00:00:00.000Z',
  });
  assert.equal(reReported.json().applied.includes('category'), true, '清空之后可以被重新报上来');
});

test('纠错台：屏蔽脏上报 → 资料回退到上一条可信值；解除屏蔽 → 值回来', async () => {
  const res = await contribute(C, {
    barcode: BARCODE,
    manufacturer: '山寨Bosch',
    observedAt: '2026-09-01T00:00:00.000Z',
  });
  assert.equal(res.statusCode, 201);
  assert.equal((await itemOf(BARCODE)).json().manufacturer, '山寨Bosch');

  const detail = (await itemOf(BARCODE)).json();
  const contributionId = res.json().contributionId;
  const blocked = await ctx.asAdmin({
    method: 'POST',
    url: `/api/admin/contributions/${contributionId}/block`,
    payload: { blocked: true, reason: '乱写厂家' },
  });
  assert.equal(blocked.statusCode, 200, blocked.body);
  assert.equal((await itemOf(BARCODE)).json().manufacturer, 'Bosch', '回退到 Bosch 那次上报');

  const audit = await ctx.asAdmin({
    method: 'GET',
    url: `/api/admin/contributions?itemId=${detail.id}&pageSize=50`,
  });
  const blockedRow = audit.json().contributions.find((row) => row.id === contributionId);
  assert.equal(blockedRow.blocked, true);
  assert.equal(blockedRow.blockedReason, '乱写厂家');

  const unblocked = await ctx.asAdmin({
    method: 'POST',
    url: `/api/admin/contributions/${contributionId}/block`,
    payload: { blocked: false },
  });
  assert.equal(unblocked.statusCode, 200);
  assert.equal((await itemOf(BARCODE)).json().manufacturer, '山寨Bosch');
});

test('纠错台：封禁实例 → 它的所有上报都不算数；解封 → 自动恢复', async () => {
  const before = (await itemOf(BARCODE)).json().name;
  const instances = await ctx.asAdmin({ method: 'GET', url: '/api/admin/instances' });
  const bad = instances.json().instances.find((row) => row.name === '刷数据的');
  assert.ok(bad);

  const blocked = await ctx.asAdmin({
    method: 'POST',
    url: `/api/admin/instances/${bad.id}/block`,
    payload: { blocked: true, reason: '刷量' },
  });
  assert.equal(blocked.statusCode, 200, blocked.body);
  assert.equal(blocked.json().recomputedItems >= 1, true, '封禁要顺手重放受影响条目');

  const after = (await itemOf(BARCODE)).json();
  assert.equal(after.name, before, '家C 没改过 name，所以 name 不变');
  assert.equal(after.manufacturer, 'Bosch', '家C 的 manufacturer 被排除后回退');

  const unblocked = await ctx.asAdmin({
    method: 'POST',
    url: `/api/admin/instances/${bad.id}/block`,
    payload: { blocked: false },
  });
  assert.equal(unblocked.statusCode, 200);
  assert.equal((await itemOf(BARCODE)).json().manufacturer, '山寨Bosch');
});

test('纠错台：合并两个条目（转移上报记录 + 保留被并条目的条码跳转）', async () => {
  await contribute(A, {
    barcode: MERGE_SOURCE,
    name: '被并的条目',
    manufacturer: '杂牌',
    observedAt: '2026-04-01T00:00:00.000Z',
  });
  await contribute(B, {
    barcode: MERGE_TARGET,
    name: '主条目',
    observedAt: '2026-04-02T00:00:00.000Z',
  });

  const found = await ctx.asAdmin({ method: 'GET', url: '/api/admin/items?q=HBMERGE' });
  const items = found.json().items;
  const source = items.find((row) => row.barcode === MERGE_SOURCE);
  const target = items.find((row) => row.barcode === MERGE_TARGET);
  assert.ok(source && target);

  const selfMerge = await ctx.asAdmin({
    method: 'POST',
    url: `/api/admin/items/${target.id}/merge`,
    payload: { sourceItemId: target.id },
  });
  assert.equal(selfMerge.statusCode, 400);
  assert.equal(selfMerge.json().code, 'item.mergeSelf');

  const merged = await ctx.asAdmin({
    method: 'POST',
    url: `/api/admin/items/${target.id}/merge`,
    payload: { sourceItemId: source.id },
  });
  assert.equal(merged.statusCode, 200, merged.body);
  const mergedBody = merged.json();
  const mergedItem = mergedBody.target;
  assert.equal(mergedItem.name, '主条目');
  assert.equal(mergedItem.manufacturer, '杂牌', '被并条目的上报记录已转到主条目上');
  assert.equal(mergedItem.instanceCount, 2);
  assert.equal(mergedBody.source.id, source.id);
  assert.equal(mergedBody.source.mergedIntoId, target.id, '被并行留着 mergedIntoId 指路');

  const viaOldBarcode = await itemOf(MERGE_SOURCE);
  assert.equal(viaOldBarcode.statusCode, 200);
  assert.equal(viaOldBarcode.json().id, target.id, '用旧条码查要跳到主条目');

  // 纠错台要能看见被并掉的行（带着 mergedIntoId），公开查询不该看见它
  const search = await ctx.asAdmin({ method: 'GET', url: '/api/admin/items?q=HBMERGE&pageSize=50' });
  assert.equal(search.json().items.length, 2, '纠错台两种条目都在');
  const mergedRow = search.json().items.find((row) => row.barcode === MERGE_SOURCE);
  assert.equal(mergedRow.mergedIntoId, target.id);
  const public1 = await ctx.inject({ method: 'GET', url: '/api/v1/items?q=HBMERGE' });
  assert.deepEqual(
    public1.json().items.map((row) => row.id),
    [target.id],
    '公开查询只返回主条目',
  );

  const again = await ctx.asAdmin({
    method: 'POST',
    url: `/api/admin/items/${target.id}/merge`,
    payload: { sourceItemId: source.id },
  });
  assert.equal(again.statusCode, 409, again.body);
  assert.equal(again.json().code, 'item.alreadyMerged');

  const late = await contribute(B, {
    barcode: MERGE_SOURCE,
    name: '后来又报的',
    observedAt: '2026-05-01T00:00:00.000Z',
  });
  assert.equal(late.statusCode, 201, late.body);
  const target2 = (await itemOf(MERGE_TARGET)).json();
  assert.equal(target2.name, '后来又报的', '新上报要落到主条目上，而不是被并掉的行');
  assert.equal(target2.id, target.id);
});

test('不存在的条码：404 item.notFound', async () => {
  const res = await itemOf('NOT-EXIST-999');
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().code, 'item.notFound');
});

test('拼错的接口回 JSON 404（而不是把 HTML 交给调用方）', async () => {
  const res = await ctx.inject({ method: 'GET', url: '/api/v1/nope' });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().code, 'route.notFound');
});

test('统计概览：总量、字段覆盖率、14 天趋势、来源排行', async () => {
  const res = await ctx.inject({ method: 'GET', url: '/api/v1/stats' });
  assert.equal(res.statusCode, 200);
  const stats = res.json();
  assert.ok(stats.totals.items >= 2);
  assert.ok(stats.totals.contributions >= 8);
  assert.equal(stats.totals.instances, 4);
  assert.equal(typeof stats.totals.lastContributionAt, 'string');
  assert.equal(stats.coverage.length, 6, '六个单值字段各一行覆盖率');
  assert.equal(stats.daily.length, 14);
  const name = stats.coverage.find((row) => row.field === 'name');
  assert.ok(name.filled >= 2);
  assert.ok(name.percent > 0 && name.percent <= 100);
  assert.ok(stats.topInstances.length >= 1);
});

test('全库重放：清掉脏数据后可以整体重算（幂等）', async () => {
  const before = (await itemOf(BARCODE)).json();
  const res = await ctx.asAdmin({ method: 'POST', url: '/api/admin/recompute' });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().items >= 2, 'POST /admin/recompute 直接返回重放条目数');
  const after = (await itemOf(BARCODE)).json();
  assert.deepEqual(after.name, before.name);
  assert.deepEqual(after.manufacturer, before.manufacturer);
  assert.deepEqual(after.fields.map((f) => f.field), before.fields.map((f) => f.field));
});
