/**
 * 物品生命周期（遗失标记 / 软删除）的源码级护栏。
 *
 * 这批改动没有可以单独抽出来的纯函数：核心规则是「所有读路径都必须带上 deletedAt IS NULL」，
 * 一旦漏掉一处，被删除的物品就会从某个接口漏出去（列表干净、搜索却能搜到这种 bug 最难查）。
 * 服务层依赖 Repository + 装饰器，跑不进零依赖的 node:test，所以这里直接对源码做断言：
 *   1. 每个有 Item / ItemUnit 读路径的服务都引用了 common/soft-delete.ts 的 alive()
 *   2. items.service.ts 的列表/详情/取件都过滤，删除改成软删除
 *   3. 唯一约束相关的检查**不能**过滤（软删除的行仍占着 barcode / traceCode / sn 的槽位）
 *   4. 控制器暴露了遗失/找回路由，且顺序不会把 'lost' 当成 unitId
 *   5. 新增的历史动作在 zh-CN / en 两种语言里都有 history.action.* 文案
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(join(here, '..', relative), 'utf8');

/** 取出某个方法的方法体（按花括号配对），用于「这段逻辑里不许出现 X」这类断言 */
function methodBody(source, signature, label = signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `找不到 ${label}`);
  const open = source.indexOf('{', start);
  assert.ok(open >= 0, `${label} 没有方法体`);

  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  assert.fail(`${label} 的方法体没有闭合`);
}

// 所有会读 Item / ItemUnit 的服务：漏一个就会出现「删掉了还能查到」的口子
const READ_PATH_SERVICES = [
  'src/items/items.service.ts',
  'src/dashboard/dashboard.service.ts',
  'src/locations/locations.service.ts',
  'src/search/search.service.ts',
  'src/scan/scan.service.ts',
  'src/collection/collection.service.ts',
];

test('每个 Item / ItemUnit 读路径都引用了软删除助手', () => {
  for (const file of READ_PATH_SERVICES) {
    const source = read(file);
    assert.ok(
      source.includes("import { alive } from '../common/soft-delete';"),
      `${file} 没有引用 common/soft-delete 的 alive()`,
    );
    assert.ok(source.includes('alive('), `${file} 引用了但没用上 alive()`);
  }

  // families.service.ts 只做聚合计数，走的是裸 QueryBuilder（没有实体查询），
  // 过滤条件写在 refine 里：别只检查 alive()，那样会漏掉这个文件。
  assert.ok(
    read('src/families/families.service.ts').includes("qb.andWhere('row.deletedAt IS NULL')"),
    'families.service.ts 的 itemCount 聚合要过滤软删除',
  );

  // 删除判定只有这一处实现：别再各写一份 `deletedAt: IsNull()`
  const helper = read('src/common/soft-delete.ts');
  assert.ok(helper.includes('IsNull()'), 'soft-delete.ts 应该用 IsNull() 表达「未删除」');
});

test('列表 / 详情 / 单条读取都过滤软删除', () => {
  const source = read('src/items/items.service.ts');

  const buildWhere = methodBody(source, 'private buildWhere(', 'buildWhere');
  assert.ok(buildWhere.includes('...alive()'), 'buildWhere 的基础条件必须带 alive()');
  assert.ok(
    buildWhere.includes('...alive()') && buildWhere.includes('units ='),
    'SN 子查询也要过滤软删除的件',
  );

  const detail = methodBody(source, 'async detail(', 'detail');
  assert.ok(detail.includes('...alive()'), 'detail 的 where 必须带 alive()');
  assert.ok(
    detail.includes('!unit.deletedAt'),
    'detail 返回的 units 要过滤软删除的件，取走计数也要跟着改',
  );

  for (const [signature, label] of [
    ['private async mustExist(', 'mustExist'],
    ['private async mustUnit(', 'mustUnit'],
    ['private async itemName(', 'itemName'],
    ['private async itemSnapshotById(', 'itemSnapshotById'],
  ]) {
    assert.ok(methodBody(source, signature, label).includes('...alive()'), `${label} 必须带 alive()`);
  }
});

test('删除是软删除：不再 delete，而是写 deletedAt 并连带处理件', () => {
  const source = read('src/items/items.service.ts');
  const remove = methodBody(source, 'async remove(', 'remove');

  assert.ok(remove.includes('deletedAt'), 'remove 应该写 deletedAt');
  assert.ok(remove.includes('manager.update(Item'), 'remove 应该 update Item 而不是 delete');
  assert.ok(
    remove.includes('manager.update(ItemUnit'),
    'remove 要连带软删除该物品的所有件',
  );
  assert.ok(
    !/manager\.delete\(Item,/.test(source),
    'items.service.ts 里不该再硬删物品（活动历史快照与唯一槽位都依赖行还在）',
  );
  assert.ok(
    /manager\.delete\(ItemUnit/.test(source),
    '单件删除（removeUnit）仍然是硬删：注释里写了理由，别顺手改成软删除把 SN 槽位永久占死',
  );
});

test('唯一槽位检查故意不过滤软删除的行（否则会撞数据库唯一约束）', () => {
  const source = read('src/items/items.service.ts');

  // 软删除的行仍然占着 (familyId, barcode/traceCode/sn) 的唯一槽位：
  // 这里过滤掉会让检查通过、随后 insert 撞唯一约束抛 500。所以这几个方法里必须没有 alive()。
  for (const [signature, label] of [
    ['private async assertBarcodeAvailable(', 'assertBarcodeAvailable'],
    ['private async assertTraceCodeAvailable(', 'assertTraceCodeAvailable'],
    ['private async assertSnAvailable(', 'assertSnAvailable'],
  ]) {
    const body = methodBody(source, signature, label);
    assert.ok(
      !body.includes('alive()'),
      `${label} 不能过滤软删除：唯一约束仍把已删行算作占用`,
    );
  }
});

test('控制器暴露遗失 / 找回路由，且 unitId 路由不会被 :unitId 吃掉', () => {
  const source = read('src/items/items.controller.ts');

  for (const route of [
    "@Post(':id/lost')",
    "@Delete(':id/lost')",
    "@Post(':id/units/:unitId/lost')",
    "@Delete(':id/units/:unitId/lost')",
  ]) {
    assert.ok(source.includes(route), `items.controller.ts 少了路由 ${route}`);
  }

  // Nest 按声明顺序匹配：/:id/units/:unitId 写在 /:id/units/:unitId/lost 前边的话，
  // 'lost' 会被 ParseIntPipe 当成 unitId 而 400。
  const lostUnit = source.indexOf("@Delete(':id/units/:unitId/lost')");
  const plainUnit = source.indexOf("@Delete(':id/units/:unitId')");
  assert.ok(lostUnit >= 0 && plainUnit >= 0, '两条 unit 路由都应该存在');
  assert.ok(lostUnit < plainUnit, "':id/units/:unitId/lost' 必须声明在 ':id/units/:unitId' 之前");
});

test('遗失 / 找回的动作在两种语言里都有文案', () => {
  const registry = read('src/activity/activity.service.ts');
  const listed = registry.slice(
    registry.indexOf('export const ACTIVITY_ACTIONS'),
    registry.indexOf('] as const;'),
  );
  const actions = [...listed.matchAll(/'([a-z_.]+)'/g)].map((match) => match[1]);
  assert.ok(actions.length > 10, `ACTIVITY_ACTIONS 解析异常，只读到 ${actions.length} 条`);

  for (const [locale, path] of [
    ['zh-CN', '../../web/i18n/locales/zh-CN.json'],
    ['en', '../../web/i18n/locales/en.json'],
  ]) {
    const messages = JSON.parse(readFileSync(join(here, path), 'utf8'));
    for (const action of actions) {
      // ActivityTimeline.vue 里是 history.action.${action.replace(/\W/g, '_')}
      const key = action.replace(/\W/g, '_');
      assert.equal(
        typeof messages.history?.action?.[key],
        'string',
        `${locale} 缺少 history.action.${key}（对应 ${action}）`,
      );
    }
  }

  // changes 里记的是 { field: 'lost' }，历史详情要能翻成中文
  const zh = JSON.parse(readFileSync(join(here, '../../web/i18n/locales/zh-CN.json'), 'utf8'));
  assert.equal(typeof zh.history?.field?.lost, 'string', 'zh-CN 缺少 history.field.lost');
});

test('遗失标记只动 lostAt，不动取走时间（取走是事实记录）', () => {
  const source = read('src/items/items.service.ts');

  for (const [signature, label] of [
    ['private async setItemLost(', 'setItemLost'],
    ['private async setUnitLost(', 'setUnitLost'],
  ]) {
    const body = methodBody(source, signature, label);
    assert.ok(body.includes('lostAt'), `${label} 应该写 lostAt`);
    assert.ok(!body.includes('takenOutAt ='), `${label} 不该改写 takenOutAt`);
  }

  // 幂等：重复标记同一个状态不写历史
  assert.ok(
    methodBody(source, 'private async setItemLost(', 'setItemLost').includes('Boolean(item.lostAt)'),
    'setItemLost 应该对相同状态直接返回（幂等）',
  );
});
