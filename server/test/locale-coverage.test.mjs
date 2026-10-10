/**
 * 多语言文案与后端契约的一致性测试（node:test，零依赖）。
 *
 * 三种键是"靠人眼维护、漏了不会报错、用户会直接看到"的：
 *   1. 后端每个 `code: 'x.y'` 都要有 api.x.y 文案（前端按 code 查表，查不到就把原始
 *      code 或裸 message 显示给用户）；
 *   2. DTO 的 class-validator 约束名要对应 validation.isXxx（flattenValidationErrors
 *      是拿 Object.keys(constraints) 当键的，class-validator 的约束名并不是装饰器名，
 *      比如 @Length 产生的是 isLength）；
 *   3. zh-CN 与 en 必须严格对称（键集合、占位符），否则切换语言会掉文案或显示 {name}。
 *
 * 运行：cd server && npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = join(SERVER_ROOT, '..');
const LOCALES = ['zh-CN', 'en'];

// ---------------------------------------------------------------- 工具

function localeRaw(locale) {
  return readFileSync(join(REPO_ROOT, 'web', 'i18n', 'locales', `${locale}.json`), 'utf8');
}

function localeFlat(locale) {
  const flat = new Map();
  const walk = (node, prefix) => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object') walk(value, path);
      else flat.set(path, String(value));
    }
  };
  walk(JSON.parse(localeRaw(locale)), '');
  return flat;
}

/** 收集 server/src 下所有 .ts 源码（不含 node_modules / dist / test） */
function serverSources() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'test') continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.ts')) files.push(path);
    }
  };
  walk(join(SERVER_ROOT, 'src'));
  return files;
}

const placeholders = (value) => new Set(Array.from(value.matchAll(/\{(\w+)\}/g), (m) => m[1]));

// ---------------------------------------------------------------- 1. 两个语言文件严格对称

test('zh-CN 与 en 的键集合完全一致', () => {
  const zh = localeFlat('zh-CN');
  const en = localeFlat('en');
  const onlyZh = [...zh.keys()].filter((key) => !en.has(key)).sort();
  const onlyEn = [...en.keys()].filter((key) => !zh.has(key)).sort();
  assert.deepEqual({ onlyZh, onlyEn }, { onlyZh: [], onlyEn: [] }, '两侧键必须逐个对应');
});

test('同一键在两个语言里的占位符必须一致', () => {
  const zh = localeFlat('zh-CN');
  const en = localeFlat('en');
  const mismatch = [];
  for (const [key, value] of zh) {
    const expected = [...placeholders(value)].sort();
    const actual = [...placeholders(en.get(key) ?? '')].sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      mismatch.push(`${key}: zh={${expected.join(',')}} en={${actual.join(',')}}`);
    }
  }
  assert.deepEqual(mismatch, [], '占位符不一致会在切换语言后显示成 {name}');
});

test('英文文案里不能残留中文或全角标点', () => {
  const cjk = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;
  const offenders = [...localeFlat('en')]
    .filter(([, value]) => cjk.test(value))
    .map(([key, value]) => `${key} = ${value}`);
  assert.deepEqual(offenders, []);
});

test('两个语言文件保持 2 空格缩进的稳定格式（改完不用重新排版）', () => {
  for (const locale of LOCALES) {
    const raw = localeRaw(locale);
    assert.equal(
      `${JSON.stringify(JSON.parse(raw), null, 2)}\n`,
      raw,
      `${locale}.json 的格式不是标准 2 空格缩进 + 末尾换行`,
    );
  }
});

// ---------------------------------------------------------------- 2. 后端错误码 ↔ api.* 文案

test('后端每个 code 都有对应的 api 文案（前端按 code 查表）', () => {
  const codes = new Set();
  for (const file of serverSources()) {
    for (const match of readFileSync(file, 'utf8').matchAll(/code: '([A-Za-z0-9_.]+)'/g)) {
      codes.add(match[1]);
    }
  }
  // 正则失效时别静默通过：改造后至少有几十个 code
  assert.ok(codes.size > 30, `只扫到 ${codes.size} 个 code，扫描逻辑可能失效`);

  // validation.failed 故意没有 api.* 文案：useApi 先把它路由到 translateValidation()
  const WITHOUT_API_KEY = new Set(['validation.failed']);
  const expected = [...codes].filter((code) => !WITHOUT_API_KEY.has(code)).sort();

  for (const locale of LOCALES) {
    const flat = localeFlat(locale);
    const missing = expected.filter((code) => !flat.has(`api.${code}`));
    assert.deepEqual(missing, [], `${locale} 缺少这些 code 的 api 文案`);
  }
});

test('api 段里不能有已经没人用的文案（改了 code 忘了删）', () => {
  const codes = new Set();
  for (const file of serverSources()) {
    for (const match of readFileSync(file, 'utf8').matchAll(/code: '([A-Za-z0-9_.]+)'/g)) {
      codes.add(match[1]);
    }
  }
  for (const locale of LOCALES) {
    const stale = [...localeFlat(locale).keys()]
      .filter((key) => key.startsWith('api.'))
      .map((key) => key.slice('api.'.length))
      .filter((code) => !codes.has(code) && code !== 'validation.failed');
    assert.deepEqual(stale, [], `${locale} 的 api 段有多余文案`);
  }
});

// ---------------------------------------------------------------- 3. DTO 校验约束名 ↔ validation.* 文案

/**
 * 装饰器名 → class-validator 实际写进 error.constraints 的键名。
 * 直接从 class-validator 的产物里读，避免手抄错（@Length → isLength 就是典型陷阱）。
 */
function constraintNamesFromClassValidator() {
  const root = join(SERVER_ROOT, 'node_modules', 'class-validator', 'cjs', 'decorator');
  const map = new Map([['ValidateNested', 'nestedValidation']]); // 它的名字不在产物里
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.js')) {
        const match = /exports\.[A-Z_0-9]+ = '([A-Za-z]+)'/.exec(readFileSync(path, 'utf8'));
        if (match) map.set(basename(path, '.js'), match[1]);
      }
    }
  };
  walk(root);
  // 关键映射的哨兵：class-validator 换目录结构或换写法时，这里会先炸
  assert.equal(map.get('Length'), 'isLength');
  assert.equal(map.get('Matches'), 'matches');
  assert.equal(map.get('IsString'), 'isString');
  assert.ok(map.size > 50, `只从 class-validator 读到 ${map.size} 个约束名，解析逻辑可能失效`);
  return map;
}

test('DTO 用到的校验器都有 validation.* 文案', () => {
  const constraints = constraintNamesFromClassValidator();
  // 这几个只是"条件开关"：class-validator 不会把它们写进 error.constraints，
  // 所以不需要文案（@IsOptionalNotNull 走的就是 ValidateIf）。
  const CONDITIONAL = new Set(['IsOptional', 'ValidateIf', 'Allow']);

  const used = new Set();
  for (const file of serverSources()) {
    for (const match of readFileSync(file, 'utf8').matchAll(/@([A-Za-z]+)\(/g)) {
      if (CONDITIONAL.has(match[1])) continue;
      const name = constraints.get(match[1]);
      if (name) used.add(name);
    }
  }
  assert.ok(used.size >= 8, `只扫到 ${used.size} 个校验约束，扫描逻辑可能失效`);

  for (const locale of LOCALES) {
    const flat = localeFlat(locale);
    const missing = [...used].filter((name) => !flat.has(`validation.${name}`)).sort();
    assert.deepEqual(missing, [], `${locale} 缺少 validation.* 文案（会直接显示英文约束名）`);
  }
});

test('validation 段不能有已经没人用的文案', () => {
  const constraints = constraintNamesFromClassValidator();
  const CONDITIONAL = new Set(['IsOptional', 'ValidateIf', 'Allow']);
  const used = new Set();
  for (const file of serverSources()) {
    for (const match of readFileSync(file, 'utf8').matchAll(/@([A-Za-z]+)\(/g)) {
      if (CONDITIONAL.has(match[1])) continue;
      const name = constraints.get(match[1]);
      if (name) used.add(name);
    }
  }

  // 这几个不是 DTO 装饰器直接产生的，但确实是运行时会用到的键，附理由保留
  const RESERVED = new Map([
    ['failed', 'translateValidation 的首行（validation.failed）'],
    ['unknown', 'class-validator 遇到没有默认文案的约束时的兜底键'],
    ['whitelistValidation', 'ValidationPipe 的 forbidNonWhitelisted 触发'],
    ['maxLength', '预留：目前没有字段用 @MaxLength'],
  ]);

  for (const locale of LOCALES) {
    const stale = [...localeFlat(locale).keys()]
      .filter((key) => key.startsWith('validation.'))
      .map((key) => key.slice('validation.'.length))
      .filter((name) => !used.has(name) && !RESERVED.has(name));
    assert.deepEqual(stale, [], `${locale} 的 validation 段有多余文案（若是有意保留请加进 RESERVED）`);
  }
});
