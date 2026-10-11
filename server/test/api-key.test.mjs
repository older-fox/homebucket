/**
 * API key 与只读 v1 接口的契约护栏（node:test，零依赖，读源码断言）。
 *
 * 这里守的是"以后容易改坏、坏了不会报错但会出安全问题"的几条：
 *   1. v1 永远只有 GET（只读 API 的承诺）；
 *   2. 家庭级接口必须挂 FamilyContextGuard（否则会跨家庭读数据）；
 *   3. 库里只存 keyHash，响应里不给 keyHash（明文只在创建时返回一次）；
 *   4. 撤销/过期/上限判断必须在鉴权路径上。
 *
 * 运行：cd server && npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = join(SERVER_ROOT, '..');

const read = (relative) => readFileSync(join(SERVER_ROOT, relative), 'utf8');
const count = (text, needle) => text.split(needle).length - 1;

/** 取某个方法体（花括号配对），用来断言"这个方法里不许/必须出现 X" */
function methodBody(source, signature, label) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `找不到方法：${label}`);
  const open = source.indexOf('{', start + signature.length);
  assert.notEqual(open, -1, `找不到方法体：${label}`);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  assert.fail(`方法体没有闭合：${label}`);
}

test('v1 只读接口：只有 GET，且家庭级路由都挂了 FamilyContextGuard', () => {
  const source = read('src/v1/v1.controller.ts');

  for (const verb of ['Post', 'Patch', 'Put', 'Delete']) {
    assert.equal(
      count(source, `@${verb}(`),
      0,
      `v1 只读接口里出现了 @${verb}()：只读承诺被破坏（要加写接口请先改这条护栏并说明理由）`,
    );
  }

  // 7 个读取路由；其中 6 个是家庭级的，必须各挂一次 FamilyContextGuard
  assert.equal(count(source, '@Get('), 7, 'v1 的路由数量变了，护栏要跟着更新');
  assert.equal(
    count(source, '@UseGuards(FamilyContextGuard)'),
    6,
    'v1 的家庭级路由少挂了 FamilyContextGuard（会跨家庭读数据）',
  );
  assert.match(source, /@UseGuards\(ApiKeyGuard\)/, 'v1 必须整体挂 ApiKeyGuard');
  assert.match(source, /scope: 'read-only'/, 'v1 /me 要标明 scope=read-only');

  const history = source.indexOf("@Get('items/:id/history')");
  const detail = source.indexOf("@Get('items/:id')");
  assert.ok(history !== -1 && detail !== -1, 'v1 的 items 路由不见了');
  assert.ok(history < detail, '@Get(items/:id/history) 必须排在 @Get(items/:id) 之前，否则 history 会被当成 id');
});

test('API key 只在创建时给明文，库里只存 sha256 摘要', () => {
  const service = read('src/api-keys/api-keys.service.ts');
  const entity = read('src/entities/api-key.entity.ts');

  assert.match(service, /keyHash: hashApiKey\(token\)/, '创建时必须把明文哈希后再入库');
  assert.match(service, /export function hashApiKey\(token: string\): string \{\s*return createHash\('sha256'\)/s, 'keyHash 必须是 sha256');

  const summary = methodBody(service, 'private toSummary(row: ApiKey)', 'toSummary');
  assert.ok(!summary.includes('keyHash'), 'toSummary 不能把 keyHash 暴露出去');
  assert.ok(!summary.includes('token'), 'toSummary 不能返回明文 token');

  // 实体里不能有存明文的列（注释里提到 token 是允许的，列声明不允许）
  assert.ok(!/\n\s*token\s*[?!]?:/.test(entity), 'ApiKey 实体不该有明文 token 列');
  assert.match(
    entity,
    /@Column\(\{ type: 'varchar', length: STRING_LENGTH, unique: true \}\)\s*\n\s*keyHash: string;/,
    'keyHash 必须唯一（否则同一把 key 会命中多行）',
  );
});

test('鉴权路径上必须校验撤销 / 过期，并刷新 lastUsedAt', () => {
  const service = read('src/api-keys/api-keys.service.ts');
  const authenticate = methodBody(service, 'async authenticate(token: string)', 'authenticate');

  assert.match(authenticate, /if \(!row \|\| row\.revokedAt\) return null;/, '已撤销的 key 必须失效');
  assert.match(authenticate, /row\.expiresAt && row\.expiresAt\.getTime\(\) <= Date\.now\(\)/, '过期的 key 必须失效');
  assert.match(authenticate, /update\(\{ id: row\.id \}, \{ lastUsedAt: new Date\(\) \}\)/, '成功鉴权要刷新 lastUsedAt');
  assert.match(service, /MAX_ACTIVE_KEYS/, '要有未撤销 key 的数量上限');
});

test('ApiKeyGuard：两种传法都收，缺 key / 无效 key 的 code 稳定', () => {
  const guard = read('src/api-keys/api-key.guard.ts');

  assert.match(guard, /req\.headers\['x-api-key'\]/, 'guard 要读 X-Api-Key 头');
  assert.match(guard, /startsWith\('Bearer '\)/, 'guard 也要接受 Authorization: Bearer <key>');
  assert.match(guard, /code: 'apiKey\.missing'/, '缺 key 的 code 变了会导致前端文案缺失');
  assert.match(guard, /code: 'apiKey\.invalid'/, '无效 key 的 code 变了会导致前端文案缺失');
  assert.match(guard, /req\.user = user;/, 'guard 必须把身份挂到 req.user，FamilyContextGuard 依赖它');
});

test('key 管理接口必须用 JWT（API key 不能管理 API key）', () => {
  const controller = read('src/api-keys/api-keys.controller.ts');

  assert.match(controller, /@Authed\(\)/, 'key 管理接口要用 @Authed()（JWT）');
  assert.ok(!controller.includes('FamilyScoped'), 'key 管理不该要求家庭上下文（key 归属账号）');
  assert.match(controller, /@Get\(\)/, '缺少列表路由');
  assert.match(controller, /@Post\(\)/, '缺少创建路由');
  assert.match(controller, /@Delete\(':id'\)/, '缺少撤销路由');
});

test('ApiKey 表在两个方言里都有迁移，且 keyHash 按字节比较', () => {
  const mysql = read('src/database/migrations/mysql/1791900000000-AddApiKey.ts');
  const sqlitePath = join(SERVER_ROOT, 'src/database/migrations/sqlite/1791900000000-AddApiKey.ts');
  assert.ok(existsSync(sqlitePath), 'SQLite 侧缺 AddApiKey 迁移');

  // sha256 十六进制是定长 ASCII：MySQL 默认的 CI 排序规则会把大小写/重音当等价，必须显式 binary
  assert.ok(
    mysql.includes('keyHash\\` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL'),
    'MySQL 的 keyHash 必须是 utf8mb4_bin，否则 "Ab" 与 "ab" 会被当成同一把 key',
  );
});

test('两个新模块都注册进了 AppModule', () => {
  const app = read('src/app.module.ts');
  assert.match(app, /ApiKeysModule,/, 'ApiKeysModule 没有注册');
  assert.match(app, /V1Module,/, 'V1Module 没有注册');
  assert.match(read('src/auth/auth.module.ts'), /exports: \[AuthService\]/, 'v1 复用 AuthService，必须在 AuthModule 里导出');

  // v1 不自己写查询：必须复用各域 service（否则软删除过滤会有第二份实现）
  const v1Module = read('src/v1/v1.module.ts');
  for (const domain of ['ItemsModule', 'LocationsModule', 'FamiliesModule', 'ActivityModule']) {
    assert.ok(v1Module.includes(domain), `V1Module 少了 ${domain}（会自己写查询、漏掉软删除过滤）`);
  }
  assert.ok(!/createQueryBuilder|getRepository/.test(read('src/v1/v1.controller.ts')), 'v1 控制器里不该出现裸 SQL/QueryBuilder');
});
