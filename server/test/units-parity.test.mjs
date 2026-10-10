/**
 * 包装换算是「前后端各写一份」的：server/src/items/packaging.ts 与
 * web/app/composables/useUnits.ts。两份实现没有编译期约束，一旦漂移，用户看到的
 * 数量与库里的最小单位数就会对不上，而且不会报任何错。这个测试把两侧拉到一起对比。
 *
 * 注意：web 的 useUnits 虽然放在 Nuxt 的 composables 目录里，但函数体是纯 JS
 * （不碰 Vue API），所以可以直接 import 进来跑；Node 24 会剥掉 TypeScript 类型。
 *
 * 运行：cd server && npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import {
  MAX_PACK_LEVELS,
  decompose as serverDecompose,
  formatBreakdown,
  normalizePackLevels,
} from '../src/items/packaging.ts';
import { useUnits } from '../../web/app/composables/useUnits.ts';

const web = useUnits();
const level = (name, factor) => ({ name, factor });

const SHOP = [level('箱', 24), level('提', 6)];

test('归一化：合法的唯一层级两侧结果一致', () => {
  const cases = [
    [level(' 箱 ', 24), level('提', 6)],
    [level('c', 6), level('a', 100), level('b', 24)],
    [level('', 6), level('箱', 24), level('半箱', 2.5), level('一', 1)],
    [],
    'not-an-array',
    undefined,
  ];
  for (const input of cases) {
    assert.deepEqual(
      web.levels(input),
      normalizePackLevels(input),
      `归一化结果应一致：${JSON.stringify(input)}`,
    );
  }
});

test('已知差异：同 factor 去重与 5 级上限只有服务端做（前端靠编辑器限制行数）', () => {
  // 这两个差异是"设计如此"而不是 bug，但必须被钉住：谁改动一侧、另一侧没跟上，
  // 这里会立刻失败并提示去看 PackLevelsEditor.vue 的 rows.length < 5。
  const dup = [level('整箱', 24), level('大箱', 24)];
  assert.deepEqual(normalizePackLevels(dup), [level('整箱', 24)], '服务端按 factor 去重，先出现者胜');
  assert.deepEqual(web.levels(dup), dup, '前端不去重');

  const many = Array.from({ length: 7 }, (_, i) => level(`l${i}`, 200 - i * 10));
  assert.equal(normalizePackLevels(many).length, MAX_PACK_LEVELS, '服务端截到 5 级');
  assert.equal(web.levels(many).length, 7, '前端不截断（PackLevelsEditor 限制最多加 5 行）');
});

test('拆分：同一数量下两侧的分级与余数完全相同', () => {
  const levels = [level('箱', 24), level('提', 6), level('包', 2)];
  for (let qty = 0; qty <= 300; qty += 1) {
    assert.deepEqual(
      web.decompose(qty, levels),
      serverDecompose(qty, normalizePackLevels(levels)),
      `qty=${qty}`,
    );
  }
  assert.deepEqual(web.decompose(-5, levels), serverDecompose(-5, normalizePackLevels(levels)));
  assert.deepEqual(web.decompose(10.9, levels), serverDecompose(10.9, normalizePackLevels(levels)));
});

test('脏输入（NaN / 字符串 / 负数）两侧都收敛到 0，不产生 NaN 余数', () => {
  const levels = [level('箱', 24), level('提', 6)];
  for (const bad of [Number.NaN, 'abc', -5, -0.5, null, undefined]) {
    assert.deepEqual(web.decompose(bad, levels), { parts: [], base: 0 }, `前端 qty=${String(bad)}`);
    assert.deepEqual(
      serverDecompose(bad, normalizePackLevels(levels)),
      { parts: [], base: 0 },
      `服务端 qty=${String(bad)}`,
    );
  }
  // 两侧都不接受负数；Math.max(0, Math.floor(NaN)) 是 NaN，所以这里用的是显式的有限性判断
  assert.equal(web.compose({ 箱: Number.NaN, 提: 'x' }, Number.NaN, levels), 0);
});

test('展示：两侧的「1箱 1提 6包」文本逐字符相同', () => {
  const levels = [level('箱', 24), level('提', 6), level('包', 2)];
  const quantities = [0, 1, 2, 6, 23, 24, 30, 53, 100, 239, 240, 241];
  for (const qty of quantities) {
    for (const baseUnit of ['包', null]) {
      assert.equal(
        web.format(qty, baseUnit, levels),
        formatBreakdown(qty, levels, baseUnit),
        `qty=${qty} baseUnit=${baseUnit}`,
      );
    }
  }
  assert.equal(web.format(48, '瓶', SHOP), formatBreakdown(48, SHOP, '瓶'));
  assert.equal(web.format(53, null, []), formatBreakdown(53, [], null), '未启用包装时都是纯数字');
});

test('前端 compose：把各级数量加回最小单位总数（服务端没有对应函数，靠 factorOf 逐个相乘）', () => {
  const levels = [level('箱', 24), level('提', 6)];
  assert.equal(web.compose({ 箱: 2, 提: 1 }, 5, levels), 2 * 24 + 1 * 6 + 5);
  assert.equal(web.compose({}, 0, levels), 0);
  assert.equal(web.compose({ 箱: -3, 提: 'x' }, -7, levels), 0, '负数与非数字都收敛到 0');

  for (let qty = 0; qty <= 200; qty += 1) {
    const { parts, base } = web.decompose(qty, levels);
    const counts = Object.fromEntries(parts.map((part) => [part.name, part.count]));
    assert.equal(web.compose(counts, base, levels), qty, `qty=${qty} 录入→展示→再录入应无损`);
  }
});

test('前端 hasPackaging：最小单位名或任一层级存在即为启用', () => {
  assert.equal(web.hasPackaging('瓶', []), true);
  assert.equal(web.hasPackaging(null, [level('箱', 24)]), true);
  assert.equal(web.hasPackaging('瓶', undefined), true);
  assert.equal(web.hasPackaging(null, []), false);
  assert.equal(web.hasPackaging('', [level('坏', 1)]), false, '非法层级不算启用包装');
});

test('档位列表 choices()：下标 0 是最小单位，之后依次是各包装层级', () => {
  // 档位的 value 必须是下标而不是名字：reka 的 SelectItem 对空字符串 value 直接抛错
  // （空串被它保留表示"清空选择"），而「最小单位」这一档本来就没有名字。
  assert.deepEqual(web.choices(undefined), [null], '没配包装时只有「最小单位」一档');
  assert.deepEqual(web.choices('not-an-array'), [null]);
  assert.deepEqual(web.choices(SHOP), [null, level('箱', 24), level('提', 6)]);
  assert.deepEqual(
    web.choices([level('坏', 1), level(' 箱 ', 24), level('半箱', 2.5)]),
    [null, level('箱', 24)],
    '非法层级不在选项里（沿用 levels() 的过滤）',
  );

  // 下标 → factor 的映射必须与分解口径一致，否则「按箱用掉」的换算会错
  const list = web.choices(SHOP);
  assert.equal(list[0] ?? 1, 1, '下标 0 = 最小单位，按 1 倍换算');
  assert.equal(list[1].factor, 24);
  assert.equal(list[2].factor, 6);
});

test('源码护栏：USelect 的选项值不要用空字符串（reka 会直接抛错）', () => {
  const root = new URL('../../web/app/', import.meta.url);
  const offenders = [];
  for (const entry of readdirSync(root, { recursive: true })) {
    const file = String(entry);
    if (!file.endsWith('.vue') && !file.endsWith('.ts')) continue;
    const source = readFileSync(new URL(file, root), 'utf8');
    if (!source.includes('<USelect')) continue;
    if (/value:\s*''/.test(source)) offenders.push(file);
  }
  assert.deepEqual(
    offenders,
    [],
    `这些文件的 USelect 选项用了空字符串 value（reka 的 SelectItem 会抛错）：${offenders.join(', ')}`,
  );

  const dialog = readFileSync(
    new URL('../../web/app/components/StockAdjustDialog.vue', import.meta.url),
    'utf8',
  );
  assert.match(dialog, /choices\(/, '盘点/消耗弹窗的档位应来自 useUnits().choices()，不要自己拼 value');
});

