import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { closeDatabase, initDatabase } from '../server/database/db.ts';
import { ContributionsService } from '../server/services/contributions.service.ts';
import { FeedbackService, ObservationsService, weightOf } from '../server/services/observations.service.ts';
import { InstancesService } from '../server/services/instances.service.ts';
import { ItemsService } from '../server/services/items.service.ts';
import { CompatService } from '../server/services/compat.service.ts';
import { AdminService } from '../server/services/admin.service.ts';
import { feedbackRepo, observationsRepo, weightsRepo } from '../server/services/repositories.ts';
import { env } from '../server/utils/env.ts';
import { resolveSourceIdentity } from '../server/utils/source.ts';

/**
 * 分源暂存 / 投票下发 / 反馈加权的集成单测。
 *
 * 与 auth.test.ts 一样**不 mock 数据库**：这一层的全部行为就是"几张表 + 重放"的语义，
 * 而它最容易出错的恰恰是查询条件本身 —— 比如"被屏蔽上报的证据算不算票"
 * "认不出来源的证据为什么不算票""改判之后权重有没有真的降下来"。这些用内存假对象测不出来。
 * node --test 每个文件独立进程，因此临时库 + 进程级单例连接是安全的。
 *
 * ── 测试里怎么制造"多个来源" ──
 * 真实流量全是匿名的（老契约连身份字段都没有），投票身份由 utils/source.ts
 * 从请求推导。测试里就照这条路走：给每次上报传一个**不同的 `sourceId`**
 * （新版客户端自报的安装 ID），换来源只要换这个字符串。
 * 这样测的是生产上真正生效的那条路径，而不是"如果客户端带 key 会怎样"。
 * 注册实例仍然有用：它给出 `instanceId`（展示用）与"封禁实例"这条排除条件。
 */

let dir = '';
let instances: InstancesService;
let contributions: ContributionsService;
let items: ItemsService;
let observations: ObservationsService;
let feedback: FeedbackService;
let compat: CompatService;
let admin: AdminService;
let instanceIds: number[];

/** 注册若干实例，返回它们的 id（顺序固定，便于断言） */
async function registerInstances(names: string[]): Promise<number[]> {
  const ids: number[] = [];
  for (const name of names) {
    const result = await instances.register({ name, description: null });
    ids.push(result.id);
  }
  return ids;
}

/** 一个来源的自报安装 ID：换它就等于换了一个上报来源（见 utils/source.ts） */
function sourceOf(index: number): { reported: string } {
  return { reported: `test-src-${index}` };
}

/** 自报 ID 对应的来源键（哈希过，所以只能这样算出来） */
function keyOf(index: number): string {
  const identity = resolveSourceIdentity(sourceOf(index));
  assert.ok(identity.key, '自报 ID 必须产生来源键');
  return identity.key;
}

/**
 * 某个已注册实例的**来源键**：注册实例本身不会让上报获得来源键，
 * 来源键只由请求特征推导，所以这里从库里的证据行反查（投票用的就是它）。
 */
async function sourceKeyOf(instanceId: number, catalogItemId: number, field: string): Promise<string> {
  const row = await observationsRepo().findOne({
    where: { instanceId, catalogItemId, field },
    order: { id: 'DESC' },
  });
  assert.ok(row, `找不到实例 ${instanceId} 在字段 ${field} 上的证据行`);
  assert.ok(row.sourceKey, `实例 ${instanceId} 的证据行必须带来源键`);
  return row.sourceKey;
}

/** 权重表按来源键索引（权重是按来源记的，不是按实例） */
async function weightsByKey(): Promise<Map<string, { weight: number; up: number; down: number }>> {
  const rows = await weightsRepo().find();
  return new Map(
    rows.map((row) => [
      String(row.sourceKey),
      { weight: Number(row.weight), up: Number(row.upvotes), down: Number(row.downvotes) },
    ]),
  );
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'hbcol-obs-'));
  await initDatabase({ database: join(dir, 'obs.db'), migrate: true, log: () => {} });
  instances = new InstancesService();
  contributions = new ContributionsService();
  items = new ItemsService();
  observations = new ObservationsService();
  feedback = new FeedbackService();
  compat = new CompatService();
  admin = new AdminService();
  instanceIds = await registerInstances(['居家', '办公室', '车库', '仓库']);
});

after(async () => {
  await closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

test('上报会把每个字段拆成一条证据，且认不出来源的证据不入投票', async () => {
  const first = await contributions.create(
    instanceIds[0]!,
    {
      barcode: 'OBS-EVIDENCE-1',
      name: '电钻',
      model: 'GSB18V',
      manufacturer: '博世',
      category: '工具',
      attributes: { 电压: '18V' },
    },
    sourceOf(0),
  );

  const rows = await observationsRepo().find({
    where: { catalogItemId: first.itemId },
    order: { field: 'ASC' },
  });
  const byField = new Map(rows.map((row) => [row.field, row]));
  // 每个非空字段各一行：5 个标量 + 1 个 attributes.<key>
  for (const field of ['name', 'model', 'manufacturer', 'category', 'attributes.电压']) {
    assert.ok(byField.has(field), `缺少 ${field} 的证据行`);
    assert.equal(Number(byField.get(field)!.instanceId), instanceIds[0], `${field} 的归属实例不对`);
    // 投票身份是来源键，不是 instanceId —— 这正是"匿名也能投票"的实现方式
    assert.equal(byField.get(field)!.sourceKey, keyOf(0), `${field} 的来源键不对`);
  }
  // 证据行存的是**当时**的权重快照（审计要能回答"当时这票值多少"）
  assert.equal(Number(byField.get('name')!.weight), env.feedback.initial);
  assert.equal(byField.get('name')!.contributionId, first.contributionId);

  // 认不出来源的上报（既没自报 ID、也拿不到 IP）同样落证据，但不能投票：
  // 投不了票的原因不是"没有实例"，而是"没有稳定身份可记账"——
  // 记不了账的反馈没有地方落，把它算进票数等于一张永远不用负责的票。
  const unknown = await contributions.create(null, { name: '电钻', manufacturer: '来路不明厂' });
  const unknownRows = await observationsRepo().find({ where: { catalogItemId: unknown.itemId } });
  assert.ok(unknownRows.length > 0, '认不出来源的上报也应留下证据行（供审计）');
  assert.ok(
    unknownRows.every((row) => row.sourceKey === null),
    '认不出来源的证据 sourceKey 必须是 null',
  );
  // 但**老实例的匿名上报照样能投票**：客户端没带 key，却带着 IP 与 UA，
  // 收集器据此推出指纹来源 —— 这是"匿名上报也参与投票"的关键差别。
  const anon = await contributions.create(
    null,
    { name: '电钻', manufacturer: '匿名厂' },
    { ip: '203.0.113.7', userAgent: 'homebucket/1' },
  );
  const anonRows = await observationsRepo().find({ where: { catalogItemId: anon.itemId } });
  assert.ok(anonRows.length > 0);
  assert.ok(
    anonRows.every((row) => row.sourceKey?.startsWith('f:') === true),
    '拿得到 IP 的匿名上报必须拿到指纹来源键',
  );
  assert.ok(
    anonRows.every((row) => row.instanceId === null),
    '匿名上报没有实例归属（instanceId 只是展示信息）',
  );
  const anonCandidates = await observations.candidates(anon.itemId, 'manufacturer');
  assert.equal(anonCandidates.length, 1, '匿名但有来源的上报必须参与投票');
  assert.equal(anonCandidates[0]!.weight, env.feedback.initial);

  const unknownCandidates = await observations.candidates(unknown.itemId, 'manufacturer');
  assert.equal(unknownCandidates.length, 0, '没有来源键的证据不得进入投票候选');
});

test('同一来源重复上报同一个值只算一票（证据行幂等）', async () => {
  const barcode = 'OBS-IDEMPOTENT-1';
  const payload = { barcode, name: '扳手', manufacturer: '史丹利' };
  const first = await contributions.create(instanceIds[0]!, payload, sourceOf(0));
  // 心跳式重复上报：来源相同、值完全相同。
  // 指纹身份要求「名称+型号+厂商」三者齐备，所以这里必须带上同一个条码，
  // 否则三次上报会落到三个不同物品上，测的就不是幂等了。
  await contributions.create(instanceIds[0]!, payload, sourceOf(0));
  await contributions.create(instanceIds[0]!, payload, sourceOf(0));

  const rows = await observationsRepo().find({
    where: { catalogItemId: first.itemId, field: 'name' },
  });
  assert.equal(rows.length, 1, '同来源同字段同值只应有一条证据（否则一次心跳能刷出一百票）');

  const tally = await observations.tally(first.itemId, 'name');
  assert.equal(tally.tallies[0]!.count, 1, '票数不该因为重复上报而增长');

  // 换个来源报同样的值：这是一张**独立的票**，必须新增一行而不是被幂等吞掉。
  // （这一条以前是缺的：早期实现按 instanceId 去重，两个匿名来源会挤成一行。）
  await contributions.create(instanceIds[1]!, payload, sourceOf(1));
  const afterSecond = await observationsRepo().find({
    where: { catalogItemId: first.itemId, field: 'name' },
  });
  assert.equal(afterSecond.length, 2, '不同来源报同一个值必须各占一行（两个来源＝两票）');
  assert.equal((await observations.tally(first.itemId, 'name')).tallies[0]!.count, 2);
});

test('同一来源改口报另一个值，也只算一票（不能自相矛盾地投两票）', async () => {
  /*
   * 这条覆盖的是一个真实缺陷：一个来源对同一字段先报 v1、再改口报 v2 时，
   * 旧实现按 (来源,值) 分组、对"同一来源的另一个值"不闻不问，于是它同时
   * 支持了两个对立的值 —— **一个来源投了两票**。
   * 后果不是"多算一票"这么轻：单枪匹马就能把票箱搅成 1:1，让本该判出最高票的
   * 字段永远 decided=false，永远走随机下发。表现为"同一个物品刷两次，下发值不一样"，
   * 看起来像随机抖动，实际是票箱被灌了。而 voting.ts 写明的契约是
   * "每个**来源**对每个字段各持一票"。
   *
   * 另一个容易写错的修法是"先按来源聚成一个候选"，那会丢掉 tallyVotes 需要的
   * 按值合并口径（count/weight 不再累加、sourceKeys 只剩一个）——
   * 所以紧挨着的下一条测试专门盯住"两个来源报同一个值必须是两票两权重"。
   */
  const barcode = 'OBS-SWITCH-1';
  const source = sourceOf(20);
  const first = await contributions.create(
    instanceIds[0]!,
    { barcode, name: 'v1', manufacturer: 'A厂' },
    source,
  );
  await contributions.create(instanceIds[0]!, { barcode, name: 'v2', manufacturer: 'A厂' }, source);

  const candidates = await observations.candidates(first.itemId, 'name');
  assert.equal(candidates.length, 1, '一个来源只应剩"最后报出的那个值"一个候选');
  assert.equal(candidates[0]!.value, 'v2', '来源改口时以它最后报的值为准');
  assert.equal(
    candidates.reduce((sum, candidate) => sum + candidate.count, 0),
    1,
    '一个来源对一个字段只能投一票',
  );

  const tally = await observations.tally(first.itemId, 'name');
  assert.equal(tally.tallies.length, 1, '被改口淘汰的旧值不能留在票箱里');
  assert.equal(tally.decided, true, '只剩一个候选，必须判出最高票而不是走随机');
  assert.equal(tally.winner!.value, 'v2');
});

test('有唯一最高票时按最高票下发（decided=true）', async () => {
  const barcode = 'OBS-MAJORITY-1';
  const first = await contributions.create(
    instanceIds[0]!,
    { barcode, name: '锤子', manufacturer: 'A厂' },
    sourceOf(10),
  );
  await contributions.create(instanceIds[1]!, { barcode, name: '锤子', manufacturer: 'A厂' }, sourceOf(11));
  await contributions.create(instanceIds[2]!, { barcode, name: '锤子', manufacturer: 'B厂' }, sourceOf(12));

  const tally = await observations.tally(first.itemId, 'manufacturer');
  assert.equal(tally.decided, true, '2:1 应当判出最高票');
  assert.equal(tally.winner!.value, 'A厂');
  assert.equal(tally.winner!.weight, 2);
  assert.equal(tally.totalWeight, 3, '三票等权（都是初始权重）');

  const decision = await observations.decisionOf(first.itemId, 'manufacturer', () => 0.99);
  assert.equal(decision!.value, 'A厂', '有最高票时不得受随机源影响');
  assert.equal(decision!.decided, true);
  assert.equal(decision!.sources.length, 2, '投给 A厂 的来源有两个');
});

test('票数并列时按权重随机下发，且随机源可复现', async () => {
  const barcode = 'OBS-TIE-1';
  const first = await contributions.create(
    instanceIds[0]!,
    { barcode, name: '锯', manufacturer: '甲厂' },
    sourceOf(20),
  );
  await contributions.create(instanceIds[1]!, { barcode, name: '锯', manufacturer: '乙厂' }, sourceOf(21));

  const tally = await observations.tally(first.itemId, 'manufacturer');
  assert.equal(tally.decided, false, '1:1 并列不该判出最高票');
  assert.equal(tally.tallies.length, 2);

  // 随机源注入：roll=0 抽到第一项、roll=0.99 抽到末项
  const low = await observations.decisionOf(first.itemId, 'manufacturer', () => 0);
  const high = await observations.decisionOf(first.itemId, 'manufacturer', () => 0.99);
  assert.equal(low!.value, '甲厂');
  assert.equal(high!.value, '乙厂');
  assert.equal(low!.decided, false, '随机下发的字段必须如实标成未决');
  assert.equal(low!.tally.length, 2, '裁决里应带上各候选的票数分布');

  // 反复抽必须**每次都落在被报过的值上**（需求原话：没有最高票就随机下发被上报的信息）。
  // 用真随机跑 40 次，值集合必须严格等于 {甲厂, 乙厂}，不能出现第三个数。
  const seen = new Set<string | null>();
  for (let i = 0; i < 40; i += 1) {
    seen.add((await observations.decisionOf(first.itemId, 'manufacturer'))!.value);
  }
  assert.deepEqual([...seen].sort(), ['乙厂', '甲厂'], '随机下发的候选只能是上报过的值');
});

test('权重高的一票即使票数相同也能判出最高票（反馈话语权）', async () => {
  const barcode = 'OBS-TIE-WEIGHT-1';
  const first = await contributions.create(
    instanceIds[0]!,
    { barcode, name: '钻头', manufacturer: '甲厂' },
    sourceOf(30),
  );
  await contributions.create(instanceIds[1]!, { barcode, name: '钻头', manufacturer: '乙厂' }, sourceOf(31));

  // 未加权前：1:1 并列，只能随机下发
  const before = await observations.tally(first.itemId, 'manufacturer');
  assert.equal(before.decided, false, '1:1 且权重相同（1.0 vs 1.0）时并列');

  // 给"乙厂"一次好评 => 乙厂的来源权重变成 1.2，而甲厂仍是 1.0。
  // 反馈记在**被评价价值的来源**上，评价方自己是谁由 reporterKey 决定。
  const rated = await feedback.submit({
    itemId: first.itemId,
    field: 'manufacturer',
    value: '乙厂',
    accurate: true,
    observationId: null,
    reporterKey: null,
    reporterInstanceId: instanceIds[2]!,
    note: null,
  });
  assert.equal(rated.sourceKey, keyOf(31), '好评必须落在乙厂那条证据的来源上');
  assert.equal(rated.upvotes, 1);

  const after = await observations.tally(first.itemId, 'manufacturer');
  assert.equal(after.decided, true, '票数相同但权重更高时，按权重判出最高票');
  assert.equal(after.winner!.value, '乙厂');
  assert.equal(after.winner!.count, 1, '票数还是 1 票');
  assert.ok(after.winner!.weight > 1, `胜出者的权重和应大于 1，实际 ${after.winner!.weight}`);
  assert.equal(after.totalWeight, 1 + after.winner!.weight, '总权重只来自这两个候选来源');

  // 有最高票之后不再受随机源影响
  const decision = await observations.decisionOf(first.itemId, 'manufacturer', () => 0);
  assert.equal(decision!.value, '乙厂');
  assert.equal(decision!.decided, true);
});

test('反馈加权：准确加权、不准确降权，且权重从反馈表重算', async () => {
  const barcode = 'OBS-FEEDBACK-1';
  const first = await contributions.create(
    instanceIds[0]!,
    { barcode, name: '卷尺', model: '5m' },
    sourceOf(40),
  );
  const rate = (accurate: boolean, note: string | null) =>
    feedback.submit({
      itemId: first.itemId,
      field: 'name',
      value: '卷尺',
      accurate,
      observationId: null,
      reporterKey: 'r:reviewer-1',
      reporterInstanceId: instanceIds[1]!,
      note,
    });

  // 给来源 40 一次好评
  const up = await rate(true, '信息准确');
  assert.equal(up.recorded, true);
  assert.equal(up.sourceKey, keyOf(40));
  assert.equal(up.weight, weightOf(1, 0));
  assert.equal(up.upvotes, 1);
  assert.equal(up.downvotes, 0);

  // 同一个人再点一次"准确"：幂等，不重复加权
  const dup = await rate(true, null);
  assert.equal(dup.recorded, false, '同一来源对同一物品同一字段只算一次');
  assert.equal(dup.weight, up.weight, '重复评价不得改变权重');
  assert.equal(dup.upvotes, 1);

  // 改判为不准确：必须真的降权（这是集成测试暴露过的回归点）
  const flip = await rate(false, '看错了');
  assert.equal(flip.recorded, true);
  assert.equal(flip.upvotes, 0, '改判后好评数必须归零');
  assert.equal(flip.downvotes, 1, '改判后差评数必须记上');
  assert.equal(flip.weight, weightOf(0, 1));
  assert.ok(flip.weight < env.feedback.initial, '差评应当把权重压到初始值之下');

  // 反馈表里只留一条（同一来源同一物品同一字段）
  const rows = await feedbackRepo().find({
    where: { sourceKey: keyOf(40), catalogItemId: first.itemId, field: 'name' },
  });
  assert.equal(rows.length, 1, '改判是更新那一票，不是新增一票');
  assert.equal(Boolean(rows[0]!.accurate), false, '改判后的判断必须落库');

  // 权重是按来源记的，且数值完全等于"把反馈表重算一遍"的结果
  const weights = await weightsByKey();
  assert.deepEqual(weights.get(keyOf(40)), {
    weight: weightOf(0, 1),
    up: 0,
    down: 1,
  });

  // 权重是**跨物品全局**的：前面的用例把 test-src-31 抬到 1.2 后，
  // 这一行必须原样留着（不能因为这次重算只涉及 40 就被清掉）。
  // 反过来说，全量重建要把"反馈已被清空"的来源行删干净 —— 见下一个用例。
  assert.deepEqual(
    weights.get(keyOf(31)),
    { weight: weightOf(1, 0), up: 1, down: 0 },
    '别的物品上的反馈带来的权重必须保留（全局权重）',
  );
  assert.deepEqual(
    [...weights.keys()].sort(),
    [keyOf(31), keyOf(40)].sort(),
    `权重表只应留下真正被评价过的来源，实际 ${JSON.stringify([...weights.keys()])}`,
  );
});

test('全量重建权重会把反馈已清空的来源行删掉（不留幽灵来源）', async () => {
  // 先造一个"被评价过、随后反馈被删光"的来源：权重行必须跟着消失，
  // 否则界面会永远显示一个 1.0 的幽灵来源，投票也会以为它被评价过。
  const weights = await weightsByKey();
  assert.ok(weights.has(keyOf(31)), '前置条件：31 此时应当有反馈带来的权重');

  // 直接删掉 31 的全部反馈，再全量重建
  await feedbackRepo().delete({ sourceKey: keyOf(31) });
  await feedback.recompute();

  const after = await weightsByKey();
  assert.equal(after.has(keyOf(31)), false, '反馈清空后不该再留权重行');
  assert.ok(after.has(keyOf(40)), '其它来源的权重不受影响');

  // 只重算指定来源时不能删行：那种调用正是为了把某个来源复位成初始权重
  await feedback.recompute([keyOf(31)]);
  const reset = await weightsByKey();
  assert.deepEqual(reset.get(keyOf(31)), { weight: env.feedback.initial, up: 0, down: 0 });
});

test('反馈驱动的权重会真正改变下发结果（含老契约）', async () => {
  const barcode = 'OBS-REWEIGHT-1';
  const first = await contributions.create(
    instanceIds[0]!,
    { barcode, name: '钳子', manufacturer: '甲厂' },
    sourceOf(50),
  );
  await contributions.create(instanceIds[1]!, { barcode, name: '钳子', manufacturer: '乙厂' }, sourceOf(51));

  const before = await observations.decisionOf(first.itemId, 'manufacturer', () => 0.99);
  assert.equal(before!.value, '乙厂', '未加权时 roll=0.99 抽到末项（乙厂）');

  // 给"甲厂"一次好评：它的来源权重变成 1.2，压过仍是 1.0 的乙厂
  const rated = await feedback.submit({
    itemId: first.itemId,
    field: 'manufacturer',
    value: '甲厂',
    accurate: true,
    observationId: null,
    reporterKey: 'r:reviewer-2',
    reporterInstanceId: instanceIds[2]!,
    note: '这个厂商号是对的',
  });
  // 直接读库核对归属：调用方传的 reporterInstanceId/reporterKey 是「谁评价的」，
  // 被评价的是哪条证据只能由 value 反查 —— 这一层错了会表现为"好评加到了别人头上"
  const ratedRows = await feedbackRepo().find({
    where: { catalogItemId: first.itemId, field: 'manufacturer' },
  });
  assert.equal(ratedRows.length, 1);
  assert.equal(ratedRows[0]!.sourceKey, keyOf(50), '反馈要落在被评价证据的来源上');
  assert.equal(Number(ratedRows[0]!.instanceId), instanceIds[0], '顺带记下被评价证据的归属实例');
  assert.equal(rated.sourceKey, keyOf(50), '反馈必须记在被评价的那条证据的来源上');
  assert.equal(rated.upvotes, 1);

  const tally = await observations.tally(first.itemId, 'manufacturer');
  assert.equal(tally.decided, true, '好评之后甲厂应按权重成为最高票');
  assert.equal(tally.winner!.value, '甲厂');
  assert.equal(tally.winner!.count, 1, '票数仍是 1 票 —— 赢在权重，不是赢在票数');
  assert.deepEqual(tally.winner!.sourceKeys, [keyOf(50)]);

  // 下发（含老契约）必须跟着投票走
  const detail = await items.detail(await items.requireById(first.itemId));
  const source = detail.fields.find((field) => field.field === 'manufacturer')!;
  assert.equal(source.value, '甲厂');
  assert.equal(source.voted, true);
  assert.equal(source.decided, true);
  assert.equal(source.voteCount, 1, '展示的票数是 1');
  assert.equal(source.voteWeight, weightOf(1, 0));
  assert.ok(source.voteWeight! > env.feedback.initial, `票权重应大于初始权重，实际 ${source.voteWeight}`);
  assert.deepEqual(source.voteSources, [keyOf(50)], '下发响应要能说清是谁投的这一票');

  const remote = await compat.lookup(barcode);
  assert.equal(remote.manufacturer, '甲厂', '老契约下发值也必须走投票');
  assert.equal(remote.barcode, barcode, '条码要回显请求里的写法');
});

test('来源指向真正报出该值的那条上报（不是最新一条）', async () => {
  const barcode = 'OBS-PROVENANCE-1';
  const first = await contributions.create(
    instanceIds[0]!,
    { barcode, name: '刷子', manufacturer: '甲厂' },
    sourceOf(60),
  );
  // 后到的上报：时间更新，但票数少
  const later = await contributions.create(
    instanceIds[1]!,
    { barcode, name: '刷子', manufacturer: '乙厂' },
    sourceOf(61),
  );
  // 给"甲厂"一次好评：它 1.2 压过乙厂 1.0，于是甲厂胜出
  await feedback.submit({
    itemId: first.itemId,
    field: 'manufacturer',
    value: '甲厂',
    accurate: true,
    observationId: null,
    reporterKey: 'r:reviewer-3',
    reporterInstanceId: instanceIds[2]!,
    note: null,
  });

  const flat = await observations.tally(first.itemId, 'manufacturer');
  const rows = await feedbackRepo().find({ where: { catalogItemId: first.itemId, field: 'manufacturer' } });
  assert.deepEqual(
    rows.map((row) => [String(row.sourceKey), Number(row.value === '甲厂')]),
    [[keyOf(60), 1]],
    `反馈只应落在甲厂的证据上：${JSON.stringify(rows.map((row) => ({ s: row.sourceKey, v: row.value })))}`,
  );
  assert.equal(flat.winner!.value, '甲厂');
  assert.ok(
    flat.winner!.weight > flat.tallies.find((row) => row.value === '乙厂')!.weight,
    '甲厂是赢在权重上',
  );

  const detail = await items.detail(await items.requireById(first.itemId));
  const source = detail.fields.find((field) => field.field === 'manufacturer')!;
  assert.equal(source.value, '甲厂');
  assert.equal(source.instanceName, '居家', '来源应指向甲厂的报出者，而不是最新那条的办公室');
  assert.notEqual(source.contributionId, later.contributionId);
  assert.deepEqual(source.voteSources, [keyOf(60)], '票的来源也必须是甲厂那一条');
});

test('图片不参与投票：累加去重，不因投票丢掉其他来源补充的照片', async () => {
  const barcode = 'OBS-IMAGES-1';
  const first = await contributions.create(instanceIds[0]!, {
    barcode,
    name: '电锯',
    imageUrls: ['https://cdn.example.com/a.jpg'],
  });
  // 第二个实例只补了一张照片：仍然要带条码，否则它没有身份、会被判成另一个物品
  await contributions.create(instanceIds[1]!, { barcode, imageUrls: ['https://cdn.example.com/b.jpg'] });

  const detail = await items.detail(await items.requireById(first.itemId));
  const source = detail.fields.find((field) => field.field === 'imageUrls')!;
  assert.equal(source.voted, undefined, '图片不走投票（它是集合并集，不是竞争标量）');
  assert.deepEqual(source.value?.split(','), [
    'https://cdn.example.com/a.jpg',
    'https://cdn.example.com/b.jpg',
  ]);
});

test('被封禁实例与已屏蔽上报的证据不参与投票', async () => {
  const barcode = 'OBS-BLOCKED-1';
  const first = await contributions.create(
    instanceIds[0]!,
    { barcode, name: '螺丝刀', manufacturer: '甲厂' },
    sourceOf(70),
  );
  const bad = await contributions.create(
    instanceIds[1]!,
    { barcode, name: '螺丝刀', manufacturer: '噪音厂' },
    sourceOf(71),
  );

  // 屏蔽那条脏上报：它的证据不算数
  await admin.setContributionBlocked(bad.contributionId, { blocked: true, reason: '垃圾数据' });
  const afterBlock = await observations.tally(first.itemId, 'manufacturer');
  assert.deepEqual(afterBlock.tallies.map((t) => t.value), ['甲厂'], '被屏蔽上报的证据必须退出投票');

  await admin.setContributionBlocked(bad.contributionId, { blocked: false });
  const restored = await observations.tally(first.itemId, 'manufacturer');
  assert.equal(restored.tallies.length, 2, '取消屏蔽后证据应重新参与投票');

  // 封禁实例：它所有的证据都不算数。
  // 注意这是**实例维度**的排除，与来源键是两套东西：来源键回答"是不是同一家"，
  // 实例封禁回答"这家已经被管理员拉黑了"。实例的封禁要连匿名上报一起挡住。
  await instances.setBlocked(instanceIds[1]!, true, '噪声来源');
  const afterBan = await observations.tally(first.itemId, 'manufacturer');
  assert.deepEqual(afterBan.tallies.map((t) => t.value), ['甲厂'], '被封禁实例的证据必须退出投票');
  await instances.setBlocked(instanceIds[1]!, false);

  // 直接封禁**来源键**：匿名流量没有实例可封，这是唯一能掐掉它的手段
  await weightsRepo().save({ sourceKey: keyOf(71), weight: env.feedback.min, upvotes: 0, downvotes: 20 });
  const afterDownweight = await observations.tally(first.itemId, 'manufacturer');
  assert.equal(afterDownweight.decided, true, '把噪声来源压到最低权重后，甲厂应当稳赢');
  assert.equal(afterDownweight.winner!.value, '甲厂');
});

test('权重公式：区间夹取与退化输入', () => {
  const { initial, up, down, min, max } = env.feedback;
  assert.equal(weightOf(0, 0), initial, '没有任何反馈时是初始权重');
  assert.equal(weightOf(1, 0), Math.min(initial * up, max));
  assert.equal(weightOf(0, 1), Math.max(initial / down, min));
  // 大量好评必须被封在 max：否则单一来源能靠反馈拿到无限话语权
  assert.equal(weightOf(100, 0), max);
  assert.equal(weightOf(0, 100), min);
  assert.ok(Number.isFinite(weightOf(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)));
});
