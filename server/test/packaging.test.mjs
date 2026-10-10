/**
 * 多级包装换算的契约测试（node:test，零依赖）。
 *
 * 为什么这组最该测：库存只存最小单位（Item.quantity），包装层级只影响录入与展示，
 * 换算错了不会报错、只会让数字悄悄变样（比如拆出「1箱 24瓶」这种显然不合理的展示）。
 * 而且同一套换算在 web/app/composables/useUnits.ts 里还有一份实现（见
 * units-parity.test.mjs），两侧都没有编译期约束，只能靠测试钉住。
 *
 * 运行：cd server && npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_PACK_LEVELS,
  decompose,
  factorOf,
  formatBreakdown,
  normalizePackLevels,
  normalizePackaging,
  packLevelsLabel,
  parsePackLevels,
  serializePackLevels,
} from '../src/items/packaging.ts';

const level = (name, factor) => ({ name, factor });
/** 无包装的经典形态：箱=24、提=6、瓶（最小单位） */
const SHOP = [level('箱', 24), level('提', 6)];

test('normalizePackLevels：丢弃非法项，只留下能安全入库的层级', () => {
  assert.deepEqual(normalizePackLevels(undefined), [], '非数组回空');
  assert.deepEqual(normalizePackLevels('24'), [], '非数组回空');
  assert.deepEqual(
    normalizePackLevels([
      level(' 箱 ', 24), // 名字要 trim
      level('', 6), // 空名字丢弃
      level('   ', 3), // 全空格丢弃
      level('超长名字'.repeat(6), 2), // 24 字符 → >20 丢弃
      level('半箱', 2.5), // 非整数丢弃
      level('零', 0), // <=1 丢弃
      level('一', 1), // <=1 丢弃
      level('负', -3), // <=1 丢弃
      level('坏', Number.NaN), // NaN 丢弃
      level('字符串', '24'), // 字符串 "24" 能转成整数 24，但 24 已被"箱"占用 → 去重时丢弃
    ]),
    [level('箱', 24)],
  );
});

test('normalizePackLevels：同名不同 factor 的重复项按 factor 去重（先出现者胜）', () => {
  assert.deepEqual(normalizePackLevels([level('整箱', 24), level('大箱', 24)]), [level('整箱', 24)]);
});

test('normalizePackLevels：按 factor 严格递减排序，最多 MAX_PACK_LEVELS 级', () => {
  const sorted = normalizePackLevels([level('c', 6), level('a', 100), level('b', 24)]);
  assert.deepEqual(sorted, [level('a', 100), level('b', 24), level('c', 6)]);

  const many = normalizePackLevels([
    level('l1', 200),
    level('l2', 100),
    level('l3', 50),
    level('l4', 20),
    level('l5', 10),
    level('l6', 5),
    level('l7', 2),
  ]);
  assert.equal(many.length, MAX_PACK_LEVELS);
  assert.deepEqual(
    many.map((item) => item.factor),
    [200, 100, 50, 20, 10],
    '截断保留 factor 最大的几级',
  );
});

test('serialize / parse 往返：空层级序列化成 null，损坏的 JSON 回退成空数组', () => {
  assert.equal(serializePackLevels([]), null);
  assert.deepEqual(parsePackLevels(null), []);
  assert.deepEqual(parsePackLevels(undefined), []);
  assert.deepEqual(parsePackLevels(''), []);
  assert.deepEqual(parsePackLevels('{不是 json'), []);
  assert.deepEqual(parsePackLevels('[{"name":"箱","factor":"24"}]'), [level('箱', 24)], '解析时也归一化');

  const normalized = normalizePackLevels(SHOP);
  assert.deepEqual(parsePackLevels(serializePackLevels(normalized)), normalized);
});

test('normalizePackaging：同时给出可入库的 baseUnit 与 packLevels', () => {
  assert.deepEqual(normalizePackaging(' 瓶 ', SHOP), {
    baseUnit: '瓶',
    packLevels: JSON.stringify(SHOP),
  });
  assert.deepEqual(normalizePackaging(null, []), { baseUnit: null, packLevels: null });
  assert.deepEqual(normalizePackaging('', undefined), { baseUnit: null, packLevels: null });
  assert.deepEqual(normalizePackaging('瓶', [level('坏', 1)]), { baseUnit: '瓶', packLevels: null });
});

test('factorOf：级别名未知或为空时按最小单位 1 计', () => {
  assert.equal(factorOf('箱', SHOP), 24);
  assert.equal(factorOf('提', SHOP), 6);
  assert.equal(factorOf('瓶', SHOP), 1, '最小单位不在层级里，按 1');
  assert.equal(factorOf(null, SHOP), 1);
  assert.equal(factorOf(undefined, SHOP), 1);
  assert.equal(factorOf('', SHOP), 1);
});

test('decompose：从大到小贪心拆分，余数为最小单位数', () => {
  assert.deepEqual(decompose(53, SHOP), {
    parts: [{ name: '箱', factor: 24, count: 2 }],
    base: 5,
  });
  assert.deepEqual(decompose(30, SHOP), {
    parts: [
      { name: '箱', factor: 24, count: 1 },
      { name: '提', factor: 6, count: 1 },
    ],
    base: 0,
  });
  assert.deepEqual(decompose(48, SHOP), { parts: [{ name: '箱', factor: 24, count: 2 }], base: 0 });
  assert.deepEqual(decompose(0, SHOP), { parts: [], base: 0 });
  assert.deepEqual(decompose(-5, SHOP), { parts: [], base: 0 }, '负数收敛到 0');
  assert.deepEqual(
    decompose(10.9, SHOP),
    { parts: [{ name: '提', factor: 6, count: 1 }], base: 4 },
    '先向下取整再拆分',
  );
  assert.deepEqual(decompose(53, []), { parts: [], base: 53 }, '未启用包装时原样返回');
  assert.equal(decompose(53, SHOP).parts.reduce((sum, p) => sum + p.count * p.factor, 0) + 5, 53);
});

test('decompose 与 recompose 恒等：拆分再乘回去必须等于最小单位总数', () => {
  const levels = normalizePackLevels([level('箱', 24), level('提', 6), level('包', 2)]);
  for (let qty = 0; qty <= 200; qty += 1) {
    const { parts, base } = decompose(qty, levels);
    const recomposed = parts.reduce((sum, part) => sum + part.count * part.factor, 0) + base;
    assert.equal(recomposed, qty, `qty=${qty} 拆分后应能无损还原`);
    assert.ok(base >= 0 && base < levels[levels.length - 1].factor, `qty=${qty} 余数必须小于最小层级`);
  }
});

test('formatBreakdown：未启用包装时保持纯数字（老数据展示零回归）', () => {
  assert.equal(formatBreakdown(53, SHOP, '瓶'), '2箱 5瓶');
  assert.equal(formatBreakdown(48, SHOP, '瓶'), '2箱');
  assert.equal(formatBreakdown(6, SHOP, '瓶'), '1提');
  assert.equal(formatBreakdown(0, SHOP, '瓶'), '0瓶', '有包装但数量为 0 时也要显示单位');
  assert.equal(formatBreakdown(53, [], null), '53');
  assert.equal(formatBreakdown(0, [], null), '0');
  assert.equal(formatBreakdown(53, [], '瓶'), '53瓶');
});

test('packLevelsLabel：历史差异里的可读串', () => {
  assert.equal(packLevelsLabel(SHOP), '箱=24, 提=6');
  assert.equal(packLevelsLabel([]), null);
});
