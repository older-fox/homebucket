import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 实例设置的防腐护栏。
 *
 * 现在 `.env` 里只剩数据库与前端进程的变量，所以「覆盖面」这条不变式换了判据：
 * 以前是".env.example 里的每个变量都要在注册表里"，现在是 **env.ts 里每个
 * `raw('X')` 都必须在注册表里** —— 谁在 env.ts 里加了一个配置读取却没登记，
 * 那个配置项在界面上就永远看不到、也改不了，这条会立刻响。
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

/** 取嵌套键，例如 'settings.fields.SERVER_PORT.label' */
function pick(json, path) {
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), json);
}

const envSource = read(join(SERVER_ROOT, 'src/config/env.ts'));

test('env.ts 里每个 raw() 读取的变量都登记在注册表里', () => {
  const names = [...envSource.matchAll(/raw\('([A-Z][A-Z0-9_]*)'\)/g)].map((match) => match[1]);
  assert.ok(names.length > 30, `只扫到 ${names.length} 处 raw()，正则或 env.ts 结构变了`);

  const registered = new Set(SETTINGS.map((def) => def.envName));
  const unregistered = [...new Set(names)].filter((name) => !registered.has(name));
  assert.deepEqual(
    unregistered, [],
    '这些配置由 env.ts 读取但没有登记进 settings.registry.ts（界面上看不到、也改不了）',
  );
});

test('注册表不含被排除的变量、且没有重复项', () => {
  for (const def of SETTINGS) {
    assert.ok(
      !DB_ENV_NAMES.has(def.envName) && !WEB_ENV_NAMES.has(def.envName),
      `${def.envName} 属于"只能在 .env 配置"的那一类，不该进注册表`,
    );
  }

  const names = SETTINGS.map((def) => def.envName);
  assert.equal(new Set(names).size, names.length, '注册表里出现了重复的 envName（后一条会悄悄赢）');
});

test('.env.example 里只允许保留数据库变量与前端进程变量', () => {
  const declared = [...read(join(REPO_ROOT, '.env.example')).matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(
    (match) => match[1],
  );
  assert.ok(declared.length > 0, '没解析到任何变量，正则或文件结构变了');

  const strays = declared.filter((name) => !DB_ENV_NAMES.has(name) && !WEB_ENV_NAMES.has(name));
  assert.deepEqual(
    strays, [],
    '这些变量不属于"只能在 .env 配置"的两类：它们应该由引导页/设置页管理（新增配置请登记到注册表）',
  );
});

test('每个配置项在中英两侧都有标签与说明', () => {
  for (const def of SETTINGS) {
    for (const [locale, json] of Object.entries(locales)) {
      for (const suffix of ['label', 'hint']) {
        const value = pick(json, `settings.fields.${def.envName}.${suffix}`);
        assert.equal(typeof value, 'string', `${locale} 缺 settings.fields.${def.envName}.${suffix}`);
        assert.ok(String(value).length > 0, `${locale} 的 ${def.envName}.${suffix} 是空串`);
      }
    }
  }
});

test('分组与风险提示的文案齐全', () => {
  for (const group of SETTING_GROUPS) {
    for (const [locale, json] of Object.entries(locales)) {
      assert.equal(
        typeof pick(json, `settings.groups.${group}`), 'string', `${locale} 缺 settings.groups.${group}`,
      );
    }
  }

  for (const warning of new Set(SETTINGS.map((def) => def.warning).filter(Boolean))) {
    for (const [locale, json] of Object.entries(locales)) {
      assert.equal(
        typeof pick(json, `settings.warning.${warning}`), 'string', `${locale} 缺 settings.warning.${warning}`,
      );
    }
  }
});

test('接口抛出的每个错误码都有对应文案', () => {
  const source = read(join(SERVER_ROOT, 'src/settings/settings.service.ts'));
  const codes = new Set(
    [...source.matchAll(/code: '(settings\.[A-Za-z]+)'/g)].map((match) => match[1]),
  );
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
  // 精确定位"用 AppModule 建应用"那次：受限启动那次用的是 SetupRestrictedModule，
  // 它出现在覆盖层之前（受限模式根本不加载设置），按 NestFactory.create 取第一次会误判
  const nest = source.indexOf('NestFactory.create<NestExpressApplication>(AppModule');

  assert.ok(migrate >= 0 && overlay >= 0 && nest >= 0, 'main.ts 的启动步骤少了预期调用');
  assert.ok(migrate < overlay, '覆盖层必须在 runMigrations() 之后加载：表要先建出来');
  assert.ok(
    overlay < nest,
    '覆盖层必须在 NestFactory.create() 之前加载：JwtModule / S3 工厂 / 日志 / cron 都在那一步读配置',
  );
  assert.ok(
    source.includes('snapshotBootValues('),
    '必须记下启动时的生效值，否则「已保存但需重启」判断不出来',
  );
});

test('容器内的锁定只出现在"容器 + 生产环境"下', () => {
  const container = read(join(SERVER_ROOT, 'src/common/container.ts'));
  // 这条别被当成 bug 改掉：去掉 NODE_ENV 条件会把开发机与 CI 也强制到 /data
  assert.match(
    container, /isContainerized\(\) && \(process\.env\.NODE_ENV \?\? 'development'\) === 'production'/,
    '锁定条件必须同时要求"容器内"与"生产环境"',
  );
  assert.match(container, /LOCKED_CONTAINER_VALUES/, '容器内被钉死的值应当集中定义在 container.ts');
});
