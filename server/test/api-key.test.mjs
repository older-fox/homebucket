/**
 * API key 与 v1 接口的契约护栏（node:test，零依赖，读源码断言）。
 *
 * 这里守的是"以后容易改坏、坏了不会报错但会出安全问题"的几条：
 *   1. 只读控制器永远只有 GET，写接口只能待在单独的写控制器里；
 *   2. 写控制器必须挂 ApiKeyWriteGuard（只放行 write scope），且写守卫不能单独挂；
 *   3. 家庭级接口必须挂 FamilyContextGuard（否则会跨家庭读写数据）；
 *   4. 库里只存 keyHash，响应里不给 keyHash（明文只在创建时返回一次）；
 *   5. 撤销/过期/上限判断必须在鉴权路径上，scope 只认自己那一行 key 的值。
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
  assert.match(
    source,
    /scope: apiKey\?\.scope === 'write' \? 'read-write' : 'read-only'/,
    'v1 /me 的 scope 必须反映这把 key 自己的权限（只读 key 报 read-only）',
  );
  assert.match(source, /@CurrentApiKey\(\) apiKey\?: ApiKeyContext/, 'v1 /me 要从请求上取当前 key');

  const history = source.indexOf("@Get('items/:id/history')");
  const detail = source.indexOf("@Get('items/:id')");
  assert.ok(history !== -1 && detail !== -1, 'v1 的 items 路由不见了');
  assert.ok(history < detail, '@Get(items/:id/history) 必须排在 @Get(items/:id) 之前，否则 history 会被当成 id');
});

test('v1 写接口：整体挂 ApiKeyWriteGuard，每条路由都挂 FamilyContextGuard', () => {
  const source = read('src/v1/v1-write.controller.ts');

  // 写控制器里不该有读路由：读接口留在只读控制器，两边不重叠
  assert.equal(count(source, '@Get('), 0, 'v1 写控制器里出现了 @Get()：读接口请放回 v1.controller.ts');

  // 守卫顺序不能反：ApiKeyWriteGuard 读的是 ApiKeyGuard 填好的 req.apiKey
  assert.match(
    source,
    /@UseGuards\(ApiKeyGuard, ApiKeyWriteGuard\)/,
    '写控制器必须同时挂 ApiKeyGuard 与 ApiKeyWriteGuard（且顺序不能反）',
  );

  // 写操作全部落到家庭上：每条路由各挂一次 FamilyContextGuard（与路由数一一对应）
  const routes = count(source, '@Post(') + count(source, '@Patch(') + count(source, '@Delete(');
  assert.equal(routes, 16, 'v1 写路由数量变了，护栏要跟着更新（也顺便核对是否漏挂守卫）');
  assert.equal(
    count(source, '@UseGuards(FamilyContextGuard)'),
    routes,
    '每条 v1 写路由都要挂 FamilyContextGuard，否则会跨家庭写数据',
  );

  // 动作型接口必须显式 200（@Post 默认 201，但取走/归还/追溯码都没有创建资源）
  assert.equal(
    count(source, '@HttpCode(HttpStatus.OK)'),
    3,
    '追溯码与取走/归还三个动作接口要显式声明 200',
  );

  // 关键路由必须在场（少一条就是少一种"任何属性"的写能力）
  for (const route of [
    "@Post('items')",
    "@Patch('items/:id')",
    "@Delete('items/:id')",
    "@Post('items/:id/lost')",
    "@Delete('items/:id/lost')",
    "@Post('items/:id/units')",
    "@Patch('items/:id/units/:unitId')",
    "@Delete('items/:id/units/:unitId')",
    "@Post('items/:id/units/:unitId/lost')",
    "@Delete('items/:id/units/:unitId/lost')",
    "@Post('items/:id/consume')",
    "@Post('items/:id/restock')",
    "@Post('items/:id/unpack')",
    "@Post('items/trace-code')",
    "@Post('scan/:code/take')",
    "@Post('scan/:code/return')",
  ]) {
    assert.ok(source.includes(route), `v1 写接口缺少 ${route}`);
  }

  // 写操作必须留痕（actorOf）且不自己写查询
  assert.ok(!/createQueryBuilder|getRepository|InjectRepository/.test(source), 'v1 写控制器里不该出现裸 SQL/QueryBuilder');
  assert.equal(count(source, 'actorOf(user)'), routes, '每个写路由都要把 actor 传给 service（否则历史里看不到是谁改的）');
});

test('写守卫：只放行 write scope，读不懂一律拒绝', () => {
  const guard = read('src/api-keys/api-key-write.guard.ts');

  assert.match(guard, /req\.apiKey\?\.scope !== 'write'/, '写守卫必须只放行 scope=write');
  assert.match(guard, /code: 'apiKey\.readOnly'/, '权限不足的 code 变了会导致前端文案缺失');
  assert.match(guard, /ForbiddenException/, '权限不足要 403（401 会让客户端误以为要换 key）');
  // req.apiKey 缺失（守卫被单独挂到没有 ApiKeyGuard 的路由上）也必须拒绝
  assert.ok(
    /if \(req\.apiKey\?\.scope !== 'write'\)/.test(guard),
    'req.apiKey 缺失时必须拒绝，而不是放行（配置错误不该变成权限漏洞）',
  );

  const controller = read('src/v1/v1-write.controller.ts');
  assert.match(controller, /@UseGuards\(ApiKeyGuard, ApiKeyWriteGuard\)/, '写控制器要挂两个守卫');
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
  assert.match(guard, /req\.user = auth\.user;/, 'guard 必须把身份挂到 req.user，FamilyContextGuard 依赖它');
  assert.match(
    guard,
    /req\.apiKey = \{ id: auth\.keyId, scope: auth\.scope \};/,
    'guard 必须把「这把 key 的 id 与 scope」挂到 req.apiKey（写守卫与 /v1/me 都依赖它）',
  );
  assert.match(
    guard,
    /export interface ApiKeyContext \{\s*id: number;\s*scope: ApiKeyScope;\s*\}/,
    'ApiKeyContext 要带 scope',
  );
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

test('key 的 scope：老 key 与读不懂的值一律按只读', () => {
  const entity = read('src/entities/api-key.entity.ts');
  const service = read('src/api-keys/api-keys.service.ts');
  const dto = read('src/api-keys/dto.ts');

  assert.match(entity, /export type ApiKeyScope = 'read' \| 'write';/, 'scope 只允许 read/write 两个值');
  assert.match(entity, /export const DEFAULT_API_KEY_SCOPE: ApiKeyScope = 'read';/, '默认必须是只读（安全默认）');
  assert.match(entity, /export const API_KEY_SCOPES: ApiKeyScope\[\] = \['read', 'write'\];/, 'API_KEY_SCOPES 是校验与文案的唯一来源');
  assert.match(
    entity,
    /@Column\(\{ type: 'varchar', length: 16, default: DEFAULT_API_KEY_SCOPE \}\)\s*\n\s*scope: ApiKeyScope;/,
    'scope 列要有默认值，否则新增的写入路径会造出 null scope 的 key',
  );

  assert.match(
    dto,
    /@IsIn\(API_KEY_SCOPES\)\s*\n\s*scope\?: ApiKeyScope;/,
    '创建 key 的 scope 必须校验（不能塞任意字符串）',
  );

  // 创建时不传 scope = 只读；传了才用传的
  assert.match(service, /scope: dto\.scope \?\? DEFAULT_API_KEY_SCOPE/, '创建时不传 scope 要落到只读');

  // 鉴权与摘要都要带上 scope，且必须过 normalizeScope
  assert.match(service, /scope: normalizeScope\(row\.scope\)/, '鉴权/摘要里的 scope 必须归一化');
  assert.match(
    service,
    /function normalizeScope\(value: string \| null \| undefined\): ApiKeyScope \{\s*return value === 'write' \? 'write' : DEFAULT_API_KEY_SCOPE;\s*\}/,
    'normalizeScope 必须是「白名单放行 write，其余全部 read」——反向写（=== read ? read : write）会变成默认放行',
  );
  assert.match(
    service,
    /export interface ApiKeyAuth \{\s*user: AuthUser;\s*keyId: number;\s*scope: ApiKeyScope;\s*\}/,
    'authenticate 要把 keyId 与 scope 一起给调用方',
  );
});

test('ApiKey.scope 在两个方言里都有迁移，默认只读', () => {
  const sqlite = read('src/database/migrations/sqlite/1792000000000-AddApiKeyScope.ts');
  const mysql = read('src/database/migrations/mysql/1792000000000-AddApiKeyScope.ts');

  // 已有 key 是只读语义：默认值必须与实体一致，且 NOT NULL
  assert.ok(
    sqlite.includes('ADD COLUMN "scope" varchar(16) NOT NULL DEFAULT (\'read\')'),
    'SQLite 迁移要给 scope 加 NOT NULL DEFAULT (\'read\')',
  );
  assert.ok(
    // 迁移文件里的 SQL 写在模板字符串中，反引号在源码里是 \` （与上面 keyHash 那条同一写法）
    mysql.includes('ADD COLUMN \\`scope\\` varchar(16) NOT NULL DEFAULT \'read\''),
    'MySQL 迁移要给 scope 加 NOT NULL DEFAULT \'read\'',
  );

  // 迁移必须可重复执行（SQLite 不能 IF NOT EXISTS 加列，靠 hasColumn 守卫）
  for (const [name, source] of [['sqlite', sqlite], ['mysql', mysql]]) {
    assert.match(source, /hasColumn\(/, `${name} 迁移要用 hasColumn 守卫`);
    assert.match(source, /public async down/, `${name} 迁移缺 down`);
    assert.ok(source.includes('DROP COLUMN') || source.includes('dropColumn'), `${name} 迁移的 down 要删掉 scope 列`);
  }
});

test('两个新模块都注册进了 AppModule', () => {
  const app = read('src/app.module.ts');
  assert.match(app, /ApiKeysModule,/, 'ApiKeysModule 没有注册');
  assert.match(app, /V1Module,/, 'V1Module 没有注册');
  assert.match(read('src/auth/auth.module.ts'), /exports: \[AuthService\]/, 'v1 复用 AuthService，必须在 AuthModule 里导出');

  // v1 不自己写查询：必须复用各域 service（否则软删除过滤会有第二份实现）
  const v1Module = read('src/v1/v1.module.ts');
  for (const domain of ['ItemsModule', 'LocationsModule', 'FamiliesModule', 'ActivityModule', 'ScanModule']) {
    assert.ok(v1Module.includes(domain), `V1Module 少了 ${domain}（会自己写查询、漏掉软删除过滤）`);
  }
  // 取走/归还复用 ScanService（按条码/SN 解析目标），不能各写一套
  assert.match(read('src/scan/scan.module.ts'), /exports: \[ScanService\]/, 'ScanModule 要导出 ScanService 给 v1 写接口用');
  assert.ok(!/createQueryBuilder|getRepository/.test(read('src/v1/v1.controller.ts')), 'v1 控制器里不该出现裸 SQL/QueryBuilder');
  assert.ok(!/createQueryBuilder|getRepository/.test(read('src/v1/v1-write.controller.ts')), 'v1 写控制器里也不该出现裸 SQL/QueryBuilder');
});
