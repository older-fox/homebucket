import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 首启引导的防腐护栏。
 *
 * 这里盯的都是**跨文件必须一致**的东西（退出码、白名单、DB-free 边界），
 * 它们一旦走偏，症状会很怪：比如退出码对不上 → 用户点完"保存"页面就死在那儿；
 * 受限模块不小心引了数据库 → 连不上库时引导页根本起不来，而那正是它该干活的时候。
 */

const here = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = join(here, '..');
const REPO_ROOT = join(SERVER_ROOT, '..');

const read = (absolute) => readFileSync(absolute, 'utf8');
const src = (relative) => read(join(SERVER_ROOT, 'src', relative));

const { SETUP_RESTART_EXIT_CODE, RESTRICTED_ALLOWED_PREFIXES, GATE_ALLOWED_PREFIXES } = await import(
  '../src/setup/setup-paths.ts'
);

test('"重启我"的退出码与 entrypoint 保持一致', () => {
  const entrypoint = read(join(REPO_ROOT, 'docker-entrypoint.sh'));
  assert.ok(
    entrypoint.includes(`-eq ${SETUP_RESTART_EXIT_CODE}`),
    `entrypoint 必须认 ${SETUP_RESTART_EXIT_CODE} 这个退出码并据此重启后端`,
  );
  // 进程平时不会用这个码：未捕获异常 1、被信号杀 143
  assert.notEqual(SETUP_RESTART_EXIT_CODE, 1);
  assert.notEqual(SETUP_RESTART_EXIT_CODE, 143);
});

test('受限启动的那一半必须完全不碰数据库', () => {
  const moduleSource = src('setup/setup-restricted.module.ts');
  // 只看 import 语句：注释里当然会提到 DatabaseModule（正是为了说明"别引它"），
  // 直接全文匹配会把那段警告当成真的 import（这个坑之前踩过一次）
  const importLines = [...moduleSource.matchAll(/^import .*$/gm)].map((match) => match[0]).join('\n');
  assert.doesNotMatch(importLines, /DatabaseModule/, '受限模块不能引 DatabaseModule：连不上库时它会让 Nest 起不来');
  assert.doesNotMatch(importLines, /ScheduleModule/, '受限模式没有业务要跑，不必挂定时模块');

  // 它引用的每个 controller 都不得注入仓库（否则在没有数据源时实例化失败）。
  // 只从 `controllers: [...]` 数组里取名字 —— 全文匹配会把注释里提到的
  // AppController（正是被它替代的那个）也当成引用。
  const controllersBlock = /controllers:\s*\[([^\]]*)\]/.exec(moduleSource)?.[1] ?? '';
  const controllers = [...controllersBlock.matchAll(/([A-Za-z]+Controller)/g)].map((match) => match[1]);
  assert.ok(controllers.length >= 3, `只从 controllers 数组里解析到 ${controllers.length} 个控制器`);

  const files = {
    SetupDatabaseController: 'setup/setup-database.controller.ts',
    SetupProbeController: 'setup/setup-probe.controller.ts',
    SetupProbeBaseController: 'setup/setup-probe-base.controller.ts',
  };
  for (const name of controllers) {
    const file = files[name];
    assert.ok(file, `受限模块引用了未登记的控制器 ${name} —— 补进本测试的 files 映射，并确认它不依赖数据库`);
    assert.doesNotMatch(src(file), /InjectRepository/, `${file} 不得注入 Repository（受限启动时没有数据源）`);
  }

  // 共享的 service 同样不能碰库
  assert.doesNotMatch(src('setup/setup.service.ts'), /InjectRepository/);
});

test('两张白名单：受限模式的放行范围应当更窄', () => {
  assert.ok(GATE_ALLOWED_PREFIXES.includes('/setup'));
  assert.ok(RESTRICTED_ALLOWED_PREFIXES.includes('/setup'));
  for (const prefix of RESTRICTED_ALLOWED_PREFIXES) {
    assert.ok(GATE_ALLOWED_PREFIXES.includes(prefix), `受限模式放行的 ${prefix} 也必须在正常模式放行`);
  }
  // 正常模式可以放行登录相关（引导第 2 步建号后要用），受限模式不行（那时根本没有库）
  assert.ok(!RESTRICTED_ALLOWED_PREFIXES.includes('/auth'));
  assert.ok(GATE_ALLOWED_PREFIXES.includes('/admin/settings'));
  assert.ok(!RESTRICTED_ALLOWED_PREFIXES.includes('/admin/settings'));
});

test('引导完成后所有入口都要关掉', () => {
  assert.match(src('setup/setup-status.controller.ts'), /isCompleted/, 'finish 前要检查完成标记');
  assert.match(src('setup/setup-admin.controller.ts'), /isCompleted/, '建号入口必须检查完成标记');
  // 更硬的一道：库里已经有用户就直接拒绝（否则这个接口将来能用来提权）
  assert.match(src('auth/auth.service.ts'), /createInitialAdmin[\s\S]{0,600}?users\.count\(\)\) > 0/);
});

test('InstanceState 迁移要回填老部署，否则升级后会被拉进引导页', () => {
  for (const provider of ['mysql', 'sqlite']) {
    const file = read(join(SERVER_ROOT, 'src/database/migrations', provider, '1792400000000-AddInstanceState.ts'));
    assert.match(
      file, /INSERT[\s\S]*?EXISTS \(SELECT 1 FROM/,
      `${provider} 的迁移必须按"库里已有用户"回填完成标记`,
    );
  }
});

test('不能再有 DEFAULT_ADMIN_* / AUTO_CREATE_ADMIN 的残留', () => {
  for (const name of ['AUTO_CREATE_ADMIN', 'DEFAULT_ADMIN_USERNAME', 'DEFAULT_ADMIN_PASSWORD', 'DEFAULT_ADMIN_EMAIL']) {
    assert.doesNotMatch(src('config/env.ts'), new RegExp(name), `env.ts 里不应再有 ${name}（第一个管理员改由引导页创建）`);
  }
  assert.doesNotMatch(readFileSync(join(REPO_ROOT, '.env.example'), 'utf8'), /DEFAULT_ADMIN|AUTO_CREATE/);
});
