import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createEvent } from 'h3';

import { closeDatabase, initDatabase } from '../server/database/db.ts';
import { ContributionsService } from '../server/services/contributions.service.ts';
import { ItemsService } from '../server/services/items.service.ts';
import { AdminService } from '../server/services/admin.service.ts';
import { SyncService, FileSyncTransport, HttpSyncTransport } from '../server/services/sync.service.ts';
import { outboundSyncRepo } from '../server/services/repositories.ts';
import { env } from '../server/utils/env.ts';
import { requireSyncToken } from '../server/utils/sync-auth.ts';

/**
 * 出站同步（"上级数据库"适配层）的集成单测。
 *
 * 不 mock 数据库，理由与 observations.test.ts 相同：这一层的风险全在**筛选条件**
 * 与**状态机**上 —— "没有条码的条目会不会被送出去""合并掉的条目会不会送两份"
 * "载荷没变会不会白传一遍""失败之后还该不该重试"。用假对象测不出这些。
 *
 * ── 环境变量怎么改 ──
 * `sync.service.ts` 在**跑的时候**读 `env.sync.*`（模块级 `env` 单例），
 * 所以测试里直接改写 `env.sync` 字段即可生效，不需要重建模块。
 * 每个用例自己负责恢复（用 t.after），避免相互污染。
 */

let dir = '';
let contributions: ContributionsService;
let items: ItemsService;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'hbcol-sync-'));
  await initDatabase({ database: join(dir, 'sync.db'), migrate: true, log: () => {} });
  contributions = new ContributionsService();
  items = new ItemsService();
});

after(async () => {
  await closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

/** 建一个有条码的条目（同步只认有条码的），返回 itemId */
async function seed(code: string, name: string, extra: Record<string, string> = {}): Promise<number> {
  const outcome = await contributions.create(
    null,
    { barcode: code, name, model: 'M1', manufacturer: '厂家', ...extra },
    { reported: `sync-test-${code}` },
  );
  return outcome.itemId;
}

/** 在测试内临时改一段 env.sync 配置，用例结束自动还原 */
function withSyncConfig(patch: Partial<typeof env.sync>): { restore: () => void } {
  const snapshot = { ...env.sync };
  Object.assign(env.sync, patch);
  return { restore: () => Object.assign(env.sync, snapshot) };
}

test('只送"有 barcode 且未被合并"的条目', async (t) => {
  const config = withSyncConfig({ transport: 'file', dir: join(dir, 'out1') });
  t.after(config.restore);

  const withCode = await seed('SYNCCODE1', '有条码的物品');
  // 无条码条目：名称+型号+厂商齐备 → 走 fingerprint 身份，不会跟上面那条合成一个
  const noCode = await contributions.create(
    null,
    { name: '没有条码的物品', model: 'X9', manufacturer: '某厂' },
    { reported: 'sync-test-nocode' },
  );

  const service = new SyncService();
  const result = await service.run({ force: true });
  assert.equal(result.configured, true, 'transport=file 时应当被认为已配置');
  assert.ok(
    result.sent >= 1,
    `至少应送出有条码的那条（实得 ${result.sent}）`,
  );

  const sentIds = new Set<number>();
  for (const file of readdirSync(join(dir, 'out1'))) {
    const payload = JSON.parse(readFileSync(join(dir, 'out1', file), 'utf8')) as {
      items: Array<{ id: number; barcode: string }>;
    };
    for (const item of payload.items) sentIds.add(item.id);
  }
  assert.ok(sentIds.has(withCode), '有条码的条目必须在载荷里');
  assert.ok(!sentIds.has(noCode.itemId), '没有条码的条目不该出现在载荷里');
  assert.equal((await items.findById(withCode))?.barcode, 'SYNCCODE1', '条码按归一化后的形式保留（大写、去分隔符）');
});

test('载荷口径：条码、属性去前缀、图片按开关带', async (t) => {
  const config = withSyncConfig({
    transport: 'file',
    dir: join(dir, 'out2'),
    includePhotos: true,
  });
  t.after(config.restore);

  // 上报侧的 attributes 是**普通对象**（键=属性名）；`attributes.` 前缀是内部表示法，
  // 由 parseAttributes 自己加。之前这里写成了内部形式，测出来"属性没进库"，
  // 实为用例用错了对外契约的写法。
  const id = await seed('SYNCCODE2', '口径物品', { attributes: { 电压: '18V' } } as never);
  const service = new SyncService();
  const preview = await service.previewOf(id);
  assert.ok(preview, '有条码的条目应当能算预览');
  const one = preview.items[0]!;
  assert.equal(one.barcode, 'SYNCCODE2');
  assert.equal(one.name, '口径物品');
  // 内部分表示法是 `attributes.电压`，出站必须是纯键（对方不该看到我方的内部前缀）
  assert.deepEqual(one.attributes, { 电压: '18V' });
  assert.equal(preview.format, 'homebucket.collector.sync/1');
  assert.equal(preview.count, 1);

  // 关掉图片开关：载荷里 imageUrls 必须是空数组，而不是把字段删掉
  // （对方按 schema 解析时字段缺失与空数组是不同的处理路径）
  const off = withSyncConfig({ includePhotos: false });
  t.after(off.restore);
  const second = await service.previewOf(id);
  assert.deepEqual(second?.items[0]?.imageUrls, []);
});

test('载荷没变且上次成功 → 跳过重传；force 时仍然重传', async (t) => {
  const config = withSyncConfig({ transport: 'file', dir: join(dir, 'out3') });
  t.after(config.restore);

  await seed('SYNCCODE3', '跳过测试');
  const service = new SyncService();

  const first = await service.run({ force: true });
  assert.ok(first.sent >= 1);

  const second = await service.run();
  assert.equal(second.sent, 0, '载荷没变时不该重传');
  assert.ok(second.skipped >= 1, '跳过的条目应当被计数');

  const forced = await service.run({ force: true });
  assert.ok(forced.sent >= 1, 'force=true 必须忽略跳过判定');
});

test('失败会记账、重试到上限后停手，但仍留在失败清单里', async (t) => {
  const config = withSyncConfig({
    transport: 'file',
    // 指向一个**文件**而不是目录：mkdir 必然失败，用来稳定制造发送失败
    dir: join(dir, 'out4-not-a-dir'),
  });
  t.after(config.restore);

  // 先造出一个真实文件占位，后续 mkdir recursive 才会 EEXIST/ENOTDIR
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(dir, 'out4-not-a-dir'), 'blocked');

  const id = await seed('SYNCCODE4', '失败重试');
  const service = new SyncService();

  const first = await service.run({ force: true });
  assert.ok(first.failed >= 1, '目录不可写时应当记为失败');
  const row = await outboundSyncRepo().findOne({ where: { catalogItemId: id } });
  assert.equal(row?.status, 'failed');
  assert.ok((row?.attempts ?? 0) >= 1);
  assert.ok(row?.lastError, '失败必须留下人话原因');

  // 把上限设成已经达到 → 不再自动重试，但必须仍然列在失败清单里
  const capped = withSyncConfig({ maxAttempts: row?.attempts ?? 1 });
  t.after(capped.restore);
  const again = await service.run();
  assert.equal(again.failed, 0, '达到重试上限后不该继续自动重试');
  assert.ok(again.skipped >= 1, '被跳过的应当是"到上限不再重试"的条目');

  const listed = await service.list('failed');
  assert.ok(
    listed.rows.some((item) => item.catalogItemId === id),
    '静默放弃比一直重试更危险：失败条目必须一直留在清单里',
  );
  assert.equal(listed.counts.failed >= 1, true);
});

test('transport=off 时什么都不做，且明确报告"未配置"', async (t) => {
  const config = withSyncConfig({ transport: 'off' });
  t.after(config.restore);

  const service = new SyncService();
  assert.equal(service.configured, false);
  const result = await service.run({ force: true });
  assert.equal(result.configured, false, '未配置时不能报成"成功 0 条"');
  assert.equal(result.scanned, 0);
  assert.equal(result.sent, 0);
});

test('payloadOf 对无条码条目返回 null（而不是送一个 barcode:null 的载荷）', async () => {
  const outcome = await contributions.create(
    null,
    { name: '无条码载荷', model: 'Q7', manufacturer: '某厂' },
    { reported: 'sync-test-payload-null' },
  );
  const service = new SyncService();
  const preview = await service.previewOf(outcome.itemId);
  assert.equal(preview, null, '无条码条目不能生成上行载荷');
});

test('FileSyncTransport 落盘文件名可区分先后且内容可读', async () => {
  const target = join(dir, 'out-file');
  const transport = new FileSyncTransport(target);
  const payload = {
    format: 'homebucket.collector.sync/1' as const,
    generatedAt: '2026-01-02T03:04:05.006Z',
    collector: { version: '0.0.0-test', dataFile: 'x.db' },
    count: 0,
    items: [],
  };
  const result = await transport.send(payload, { index: 0, total: 1 });
  assert.equal(result.ok, true);
  assert.ok(result.remoteRef);
  const files = readdirSync(target);
  assert.equal(files.length, 1);
  // `:` 与 `.` 在文件名里做不了区分（Windows 也不允许 `:`），必须被替换掉
  assert.ok(!files[0]!.includes(':'), '文件名里不能残留冒号');
  const written = JSON.parse(readFileSync(join(target, files[0]!), 'utf8'));
  assert.equal(written.format, payload.format);
});

test('HttpSyncTransport：2xx 算成功并尽力读远端标识，非 2xx 记人话错误', async () => {
  const { createServer } = await import('node:http');
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (req.url === '/ok') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: 4242 }));
        return;
      }
      if (req.url === '/not-json') {
        res.writeHead(201);
        res.end('accepted');
        return;
      }
      res.writeHead(500, { 'content-type': 'text/html' });
      res.end(`<html>${'很长的错误页'.repeat(200)}</html>`);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    const payload = {
      format: 'homebucket.collector.sync/1' as const,
      generatedAt: '2026-01-02T03:04:05.006Z',
      collector: { version: 'test', dataFile: 'x.db' },
      count: 1,
      items: [],
    };
    const ok = await new HttpSyncTransport(`http://127.0.0.1:${port}/ok`, '', 5000).send(payload, {
      index: 0,
      total: 1,
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.remoteRef, '4242', '对方返回数字 id 时也要记成远端标识');

    // 201 也是成功：对方接口未定，不能假设一定是 200
    const created = await new HttpSyncTransport(`http://127.0.0.1:${port}/not-json`, '', 5000).send(
      payload,
      { index: 0, total: 1 },
    );
    assert.equal(created.ok, true);
    assert.equal(created.remoteRef, undefined, '读不出标识不算失败');

    const failed = await new HttpSyncTransport(`http://127.0.0.1:${port}/boom`, '', 5000).send(
      payload,
      { index: 0, total: 1 },
    );
    assert.equal(failed.ok, false);
    assert.ok(failed.error?.includes('500'));
    assert.ok((failed.error?.length ?? 0) < 300, '错误详情必须截断，否则错误列会被整页 HTML 撑爆');

    // 连不上的地址：必须是"请求失败"而不是抛出异常（抛出会让整轮同步中断）
    const refused = await new HttpSyncTransport('http://127.0.0.1:1/nope', '', 800).send(payload, {
      index: 0,
      total: 1,
    });
    assert.equal(refused.ok, false);
    assert.ok(refused.error?.includes('请求失败'));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('reset 把条目退回待同步，且只动账本不碰资料', async (t) => {
  const config = withSyncConfig({ transport: 'file', dir: join(dir, 'out5') });
  t.after(config.restore);

  const id = await seed('SYNCCODE5', '重置测试');
  const service = new SyncService();
  await service.run({ force: true });
  const before = await service.list('ok');
  assert.ok(before.rows.some((row) => row.catalogItemId === id), '先确保它已经同步成功过');

  const reset = await service.reset(id);
  assert.equal(reset?.status, 'pending');
  assert.equal(reset?.attempts, 0);
  assert.equal(reset?.lastError, null);
  assert.equal((await items.findById(id))?.name, '重置测试', '重置只该动同步账本，不该改动资料本身');
  // 没有同步记录的条目：返回 null，让路由能给出明确结果而不是 500
  assert.equal(await service.reset(999_999), null);
});

test('导出方向与推送方向看到的是同一批条目（含 total/hasMore 分页语义）', async (t) => {
  const config = withSyncConfig({ transport: 'file', dir: join(dir, 'out6') });
  t.after(config.restore);

  await seed('SYNCCODE6', '导出一');
  await seed('SYNCCODE7', '导出二');
  const service = new SyncService();

  const total = await service.exportCount();
  assert.ok(total >= 2, `导出口径至少要看到刚建的两条（实得 ${total}）`);

  const page1 = await service.exportPage(0, 1);
  assert.equal(page1.length, 1, '分页必须真的只给一页的量');
  const page2 = await service.exportPage(1, 1);
  assert.equal(page2.length, 1);
  assert.notEqual(page1[0]!.id, page2[0]!.id, '相邻两页不能给出同一条');

  // 导出的条目必须都能生成推送载荷（两个方向共用筛选条件与 payloadOf）
  for (const item of page1) {
    assert.ok(item.barcode, '导出项必须带条码');
    assert.equal(typeof item.provenance, 'object');
  }
});

test('按条码导出单个条目；未收录返回 null', async () => {
  const id = await seed('SYNCCODE8', '单条导出');
  const service = new SyncService();
  const one = await service.exportOneByBarcode('SYNCCODE8');
  assert.ok(one, '已收录的条码必须能单条导出');
  assert.equal(one.id, id);
  assert.equal(await service.exportOneByBarcode('NOT-EXIST-9999'), null);
  assert.equal(await service.exportOneByBarcode('   '), null, '空白条码不该去查库');
});

test('同步令牌：未配置时明确拒绝，配了则必须带对的令牌', () => {
  // 必须用 h3 的真事件：`getHeader` 走的是内部的 normalizedHeaders，
  // 手搓一个 `{node:{req:{headers}}}` 形状读不到值，会把"读不到令牌"误判成"逻辑正确"
  const eventOf = (headers: Record<string, string>) =>
    createEvent(
      { method: 'GET', url: '/api/v1/export', headers } as unknown as Parameters<typeof createEvent>[0],
      { _kRawBody: undefined, _kMethod: 'GET' } as unknown as Parameters<typeof createEvent>[1],
    );

  const snapshot = env.sync.token;
  try {
    env.sync.token = '';
    // 没配令牌时必须拒绝：全量导出默认敞开等于把内网当安全边界
    expectApiError(() => requireSyncToken(eventOf({})), 'sync.tokenNotConfigured');

    env.sync.token = 'secret-token';
    expectApiError(() => requireSyncToken(eventOf({})), 'sync.tokenInvalid');
    expectApiError(
      () => requireSyncToken(eventOf({ authorization: 'Bearer wrong' })),
      'sync.tokenInvalid',
    );
    // 正确的两种写法都必须通过（对方可能用头也可能是标准 Bearer）
    requireSyncToken(eventOf({ authorization: 'Bearer secret-token' }));
    requireSyncToken(eventOf({ 'x-collector-sync-token': 'secret-token' }));
  } finally {
    env.sync.token = snapshot;
  }
});

/**
 * 断言抛出的确实是 API 错误信封。
 *
 * 这里**不能**用 `assert.throws(fn, predicate)`：谓词里再 assert 失败时，
 * 断言错误会被 throws 当成"谓词返回假"吞掉，报出来的信息变成没头没尾的
 * `抛出的必须是带 code 的 API 错误`，真正的原因（code 对不上）反而看不见。
 * 所以显式捕获后自己断言 `ApiError` 与 code。
 */
function expectApiError(fn: () => unknown, code: string): void {
  let caught: unknown;
  let threw = false;
  try {
    fn();
  } catch (error) {
    threw = true;
    caught = error;
  }
  assert.equal(threw, true, `期望抛出 ${code}，但什么都没抛`);
  const actual = (caught as { code?: string; statusCode?: number })?.code;
  assert.equal(actual, code, `错误码不对（期望 ${code}，实得 ${String(actual)}）`);
}

test('导入回灌不能绕过重放：它必须落成一条可见上报', async () => {
  // 这条断言的是**架构约束**而不是某个函数：回灌若直写物化列，
  // 下一轮重放就会把它冲掉，表现为"改完过一会儿自己变回去"。
  const contributionsService = new ContributionsService();
  const outcome = await contributionsService.create(
    null,
    // 回灌同样走对外契约：attributes 是普通对象，纯键
    { barcode: 'IMPORTCODE1', name: '回灌物品', attributes: { 功率: '500W' } },
    { reported: 'peer-system' },
  );
  assert.ok(outcome.contributionId > 0, '回灌必须产生一条 Contribution');
  assert.ok(outcome.applied.includes('name'));

  const detail = await items.detail(await items.requireById(outcome.itemId));
  assert.equal(detail.name, '回灌物品');
  // detail.attributes 是**普通对象**（键=属性名）。
  // 注意别与 `detail.fields` 混淆：那一份用的是内部扁平名 `attributes.功率`
  // （供锁定与投票用，见 provenance.ts）。两者键的形态不同，是同一次上报的两种视图。
  assert.equal(detail.attributes['功率'], '500W');
  assert.equal(
    detail.fields.some((field) => field.field === 'attributes.功率' && field.value === '500W'),
    true,
    '内部扁平视图里应当有 attributes.功率',
  );

  // 重放一遍：值必须还在（能扛住重放，才说明它是重放的结果而不是被硬写进去的）
  const admin = new AdminService();
  const recomputed = await admin.recomputeAll();
  assert.ok(recomputed.items >= 1);
  const after = await items.detail(await items.requireById(outcome.itemId));
  assert.equal(after.name, '回灌物品', '重放后回灌的值必须仍然在');
});
