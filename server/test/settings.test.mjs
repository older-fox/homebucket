import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 「设置 → 实例设置」的防漂移护栏。
 *
 * 这套功能的核心不变式只有一条：**`.env` 里的每个 server 变量都必须能在界面上改**。
 * 只要有人往 `.env.example` 加了变量却没进注册表，它就会悄悄变成一个"只能改文件、
 * 界面上看不到"的配置项 —— 这条测试就是防这个。
 *
 * 注册表本身是纯 TS（不带装饰器），所以这里可以直接 import 它来做集合比较；
 * 需要看服务实现的那几条（密钥不外泄、启动顺序）按本仓库既有做法扫源码文本。
 */

const here = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = join(here, '..');
const REPO_ROOT = join(SERVER_ROOT, '..');
const WEB_LOCALES = join(REPO_ROOT, 'web', 'i18n', 'locales');

const read = (absolute) => readFileSync(absolute, 'utf8');

const { SETTINGS, DB_ENV_NAMES, WEB_ENV_NAMES, SETTING_GROUPS } = await import(
  '../src/settings/settings.registry.ts'
);

const locales = {
  'zh-CN': JSON.parse(read(join(WEB_LOCALES, 'zh-CN.json'))),
  en: JSON.parse(read(join(WEB_LOCALES, 'en.json'))),
};

/**
 * 取嵌套键，例如 'settings.fields.SERVER_PORT.label'。
 *
 * 注意 `api` 段是**扁平的**（键本身就带点，如 `api["settings.invalidBody"]`），
 * 所以那边的查询要直接用 `json.api[code]`，不能走这个函数。
 */
function pick(json, path) {
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), json);
}

test('注册表覆盖了 .env.example 里全部 server 变量，且不多不少', () => {
  const declared = [...read(join(REPO_ROOT, '.env.example')).matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(
    (match) => match[1],
  );
  assert.ok(declared.length > 0, '没从 .env.example 里解析到任何变量，正则或文件结构变了');

  const expected = declared
    .filter((name) => !DB_ENV_NAMES.has(name) && !WEB_ENV_NAMES.has(name))
    .sort();

  const actual = SETTINGS.map((def) => def.envName).sort();

  // 双向比较：漏掉的（加了 .env 变量忘了进注册表）与多余的（注册表写了 .env 里没有的）
  const missing = expected.filter((name) => !actual.includes(name));
  const extra = actual.filter((name) => !expected.includes(name));
  assert.deepEqual(missing, [], '这些 .env 变量没有进 settings.registry.ts（界面上改不了）');
  assert.deepEqual(extra, [], '注册表里有 .env.example 中不存在的变量');

  // 同一个变量写两遍会让后一条悄悄赢掉，界面上却看不出来
  assert.equal(new Set(actual).size, actual.length, '注册表里出现了重复的 envName');
});

test('排除项本身不能出现在注册表里', () => {
  const names = new Set(SETTINGS.map((def) => def.envName));
  for (const excluded of [...DB_ENV_NAMES, ...WEB_ENV_NAMES]) {
    assert.ok(!names.has(excluded), `${excluded} 被明确排除，不该出现在注册表里`);
  }
  // AUTO_MIGRATE 与数据库连接必须在排除清单里：它们要在库可读之前就确定，无法由库里的配置覆盖
  for (const name of ['DB_PROVIDER', 'DATABASE_URL', 'DB_FILE_PATH', 'AUTO_MIGRATE']) {
    assert.ok(DB_ENV_NAMES.has(name), `${name} 必须留在 .env（读它时还没有库）`);
  }
});

test('每个配置项在中英两侧都有标签与说明', () => {
  for (const def of SETTINGS) {
    for (const [locale, json] of Object.entries(locales)) {
      for (const suffix of ['label', 'hint']) {
        const value = pick(json, `settings.fields.${def.envName}.${suffix}`);
        assert.equal(
          typeof value,
          'string',
          `${locale} 缺 settings.fields.${def.envName}.${suffix}`,
        );
        assert.ok(String(value).length > 0, `${locale} 的 ${def.envName}.${suffix} 是空串`);
      }
    }
  }
});

test('分组与风险提示的文案齐全', () => {
  for (const group of SETTING_GROUPS) {
    for (const [locale, json] of Object.entries(locales)) {
      assert.equal(
        typeof pick(json, `settings.groups.${group}`),
        'string',
        `${locale} 缺 settings.groups.${group}`,
      );
    }
  }

  const usedWarnings = new Set(SETTINGS.map((def) => def.warning).filter(Boolean));
  for (const warning of usedWarnings) {
    for (const [locale, json] of Object.entries(locales)) {
      assert.equal(
        typeof pick(json, `settings.warning.${warning}`),
        'string',
        `${locale} 缺 settings.warning.${warning}`,
      );
    }
  }
});

test('接口抛出的每个错误码都有对应文案', () => {
  const source = read(join(SERVER_ROOT, 'src/settings/settings.service.ts'));
  // 与 locale-coverage.test.mjs 取的是同一种字面量：抛错处必须写成
  // `new BadRequestException({ code: 'settings.x', message: ... })`，code 不能藏在变量里
  const codes = new Set(
    [...source.matchAll(/code: '(settings\.[A-Za-z]+)'/g)].map((match) => match[1]),
  );
  // 守卫里那个 403 不在 service 里，单独补上
  codes.add('settings.adminOnly');

  assert.ok(codes.size >= 8, `只扫到 ${codes.size} 个错误码，应该是解析出了问题`);
  for (const code of codes) {
    for (const [locale, json] of Object.entries(locales)) {
      assert.equal(typeof json.api[code], 'string', `${locale} 缺 api.${code}`);
    }
  }
});

test('密钥项永远不回传明文', () => {
  const source = read(join(SERVER_ROOT, 'src/settings/settings.service.ts'));

  // 只看 view() 里那段 `if (def.type === 'secret') { ... }`：密钥项必须只回"是否已设置"
  const branch = /if \(def\.type === 'secret'\) \{[\s\S]*?\n    \}/.exec(source);
  assert.ok(branch, '没找到密钥分支，view() 的实现结构变了');
  assert.match(branch[0], /isSet/, '密钥分支应当返回 isSet');
  assert.doesNotMatch(branch[0], /value\s*:/, '密钥分支不得返回 value（那就是回传明文了）');
  assert.doesNotMatch(branch[0], /defaultValue/, '密钥分支不得返回内置默认值');

  // 反过来确认普通项确实带 value：否则上面那条"没有 value"可能是因为整个 view 都坏了
  const normal = /const stored = raw\(def\.envName\);[\s\S]*?\n  \}/.exec(source);
  assert.ok(normal, '没找到普通项分支');
  assert.match(normal[0], /value:/, '普通项应当返回 value');
});

test('设置覆盖层在迁移之后、Nest 构造之前加载', () => {
  const source = read(join(SERVER_ROOT, 'src/main.ts'));
  const migrate = source.indexOf('await runMigrations()');
  const overlay = source.indexOf('await loadSettingsOverrides()');
  // 用带 `await` 的形式定位真正的调用：上面几行注释里也提到了 NestFactory.create
  const nest = source.indexOf('await NestFactory.create');

  assert.ok(migrate >= 0 && overlay >= 0 && nest >= 0, 'main.ts 的启动步骤少了预期调用');
  assert.ok(
    migrate < overlay,
    '覆盖层必须在 runMigrations() 之后加载：表要先建出来',
  );
  assert.ok(
    overlay < nest,
    '覆盖层必须在 NestFactory.create() 之前加载：JwtModule / S3 工厂 / 日志 / cron 都在那一步读配置',
  );
  assert.ok(
    source.includes('snapshotBootValues('),
    '必须记下启动时的生效值，否则「已保存但需重启」判断不出来',
  );
});

test('设置模块不自己引 scheduler（定时任务的持有者仍是 src/collection）', () => {
  const dir = join(SERVER_ROOT, 'src/settings');
  const files = readdirSync(dir).filter((name) => statSync(join(dir, name)).isFile());
  assert.ok(files.length > 0);

  for (const file of files) {
    assert.doesNotMatch(
      read(join(dir, file)),
      /from '@nestjs\/schedule'/,
      `settings/${file} 不应直接引用 @nestjs/schedule：应该注入 CollectionSyncService 调它的 reregister()`,
    );
  }

  // 而热更的入口确实在 collection 那边
  assert.match(
    read(join(SERVER_ROOT, 'src/collection/collection-sync.service.ts')),
    /reregister\(\): void/,
    'CollectionSyncService 应暴露 reregister() 供保存后热更',
  );
});
