import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { createI18n } from 'vue-i18n';

/**
 * 界面文案的**编译期**体检。
 *
 * ── 为什么需要这个文件（这里踩过一次，代价很大）──
 * vue-i18n 用的是 ICU 消息语法：`{name}` 是占位符，`{}` 是"空占位符"、
 * `{key=value}` 是"占位符里出现了非法字符"。这些**都不是**翻译文件加载时会报的错 ——
 * 只有真的 `t('那个 key')` 那一刻才会在浏览器里抛
 * `SyntaxError: Invalid token in placeholder`（压缩后只剩 `SyntaxError: 2`）。
 *
 * 实际故障：`admin.detail.editHint` 里写了一段给人看的示例 `{key=value}`，
 * 于是纠错台一点「打开」就整块渲染不出来，页面上既没有报错框也没有内容 ——
 * 而 typecheck、单测、e2e（只查 HTTP 响应）**全都通过**。一个 UI 文案把整页打没了。
 *
 * 想输出字面量花括号必须写成 `{'…'}`（vue-i18n 的转义写法），本文件就是盯住这件事。
 */

/** 各语言文件里所有 key 的并集 —— 两边必须一模一样，缺一个就是切语言时才发现的空白。 */
function flatten(source: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (source === null || typeof source !== 'object') return out;
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') flatten(value, path, out);
    else out[path] = String(value);
  }
  return out;
}

function loadLocale(code: string): Record<string, string> {
  const url = new URL(`../i18n/locales/${code}.json`, import.meta.url);
  return flatten(JSON.parse(readFileSync(url, 'utf8')));
}

const locales = {
  zh: loadLocale('zh'),
  en: loadLocale('en'),
};

/** 占位符名（只认 `{name}` 形态；`{'…'}` 是转义不算占位符）。 */
function placeholdersOf(message: string): string[] {
  const names: string[] = [];
  const pattern = /\{\s*([A-Za-z_][\w]*)\s*\}/g;
  let match = pattern.exec(message);
  while (match !== null) {
    names.push(match[1] as string);
    match = pattern.exec(message);
  }
  return names.sort();
}

test('中英文案的 key 集合完全一致（不能只在一种语言里有）', () => {
  const zhKeys = Object.keys(locales.zh).sort();
  const enKeys = Object.keys(locales.en).sort();
  assert.deepEqual(enKeys.filter((key) => !(key in locales.zh)), [], 'en 里多出来的 key（中文缺）');
  assert.deepEqual(zhKeys.filter((key) => !(key in locales.en)), [], 'zh 里多出来的 key（英文缺）');
});

test('每条文案都能被 vue-i18n 编译（字面量花括号必须转义成 {\'…\'}）', () => {
  // 覆盖所有会出现在文案里的参数名；多给不影响，少给才会因为缺参数而报错。
  const sample: Record<string, string | number> = {
    action: '屏蔽',
    attempts: 2,
    baseline: '1.00',
    barcode: '6901234567892',
    complete: 4,
    contributions: 3,
    count: 2,
    date: '2026-01-01',
    failed: 1,
    field: 'name',
    fields: 'name、model',
    firstName: '甲',
    format: 'json',
    generatedAt: '2026-01-01 00:00',
    hint: '提示',
    hints: '提示',
    id: 1,
    images: 2,
    instances: 3,
    item: '物品',
    itemId: 1,
    items: 4,
    key: 'f:abc',
    kind: '指纹',
    lastName: '乙',
    max: 5,
    min: 0,
    missingField: '型号',
    name: 'Name',
    page: 1,
    pages: 3,
    payload: '{}',
    provenance: '来源',
    remoteRef: '42',
    scanned: 10,
    seconds: 30,
    sent: 8,
    skipped: 1,
    sourceId: 1,
    status: 200,
    summary: '摘要',
    syncedAt: '2026-01-01 00:00',
    targetId: 2,
    text: '文本',
    time: '2026-01-01 00:00',
    total: 9,
    totalWeight: '4.20',
    transport: 'http',
    upvotes: 1,
    downvotes: 0,
    value: '值',
    weight: '1.20',
  };

  const broken: string[] = [];
  for (const [code, messages] of Object.entries(locales)) {
    // legacy:false 才是 `t()` 直出字符串的用法；编译错误会在这里当场抛出。
    const i18n = createI18n({ legacy: false, locale: code, messages: { [code]: messages } });
    for (const [key, message] of Object.entries(messages)) {
      try {
        const rendered = i18n.global.t(key, sample);
        // 编译成功但把 `{'…'}` 原样留在输出里，说明转义写法写错了位置。
        assert.ok(!rendered.includes("{'"), `${code}.${key} 渲染后仍有未解析的转义：${rendered}`);
        assert.ok(rendered.length > 0, `${code}.${key} 渲染成了空串`);
      } catch (caught) {
        broken.push(`${code}.${key}: ${(caught as Error).message.split('\n')[0]}（原文：${message.slice(0, 60)}）`);
      }
    }
  }
  assert.deepEqual(broken, [], `有文案无法编译：\n${broken.join('\n')}`);
});

test('同一 key 在中英文里的占位符必须一一对应', () => {
  const mismatched: string[] = [];
  for (const key of Object.keys(locales.zh)) {
    const zhMessage = locales.zh[key] as string;
    const enMessage = locales.en[key];
    if (enMessage === undefined) continue;
    assert.notEqual(zhMessage.trim(), '', `zh.${key} 是空文案`);
    const zhNames = placeholdersOf(zhMessage);
    const enNames = placeholdersOf(enMessage as string);
    if (JSON.stringify(zhNames) !== JSON.stringify(enNames)) {
      mismatched.push(`${key}: zh=[${zhNames.join(',')}] en=[${enNames.join(',')}]`);
    }
  }
  assert.deepEqual(mismatched, [], `占位符对不上（切语言会缺参数）：\n${mismatched.join('\n')}`);
});

test('转义写法确实能渲染出字面量花括号', () => {
  const i18n = createI18n({
    legacy: false,
    locale: 'zh',
    messages: { zh: { sample: "{'{'}属性名=属性值{'}'}" } },
  });
  assert.equal(i18n.global.t('sample'), '{属性名=属性值}');
});
