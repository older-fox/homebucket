/**
 * 收集器协议端到端：打一个**真实运行**的收集器进程，覆盖两套协议与纠错台。
 *
 * 默认自己拉起 dev server（`nuxt dev`，临时库 + 随机端口，跑完杀掉）；
 * 也可以指向已经跑着的实例：`COLLECTOR_BASE=http://127.0.0.1:3400 npm run test:e2e`。
 *
 * 与 `npm test`（纯函数 + 服务层）的分工：这里只关心"HTTP 面上到底发生了什么"——
 * 状态码、错误码、响应形状、老契约兼容性。改动路由/响应后一定要跑它。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EXTERNAL_BASE = (process.env.COLLECTOR_BASE ?? '').trim();
// 管理端已改为账号 + 口令登录（服务端会话 + httpOnly cookie）。自拉进程时把这几项传下去，
// 保证脚本打的是它自己配的账号；打外部实例时用外部实例的配置（可用环境变量覆盖）。
const ADMIN_USERNAME = process.env.COLLECTOR_ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.COLLECTOR_ADMIN_PASSWORD ?? 'dev-admin-password';
const LOGIN_RATE_LIMIT = Number(process.env.COLLECTOR_LOGIN_RATE_LIMIT ?? 5);
const SESSION_COOKIE_NAME = 'hb_collector_session';
const STARTUP_TIMEOUT_MS = Number(process.env.COLLECTOR_E2E_TIMEOUT_MS ?? 120_000);

let pass = 0;
let fail = 0;
const failures = [];
/** 会话 cookie：httpOnly，浏览器/脚本都读不到值，只能在 fetch 里**原样回传** */
let sessionCookie = null;

function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

let BASE = EXTERNAL_BASE;
let child = null;
let tempDir = null;
/** dev server 的输出尾巴：健康检查超时时贴出来，否则"等了 120 秒"这种报错没法排查
 *  （最常见的原因其实是 Nuxt 的 dev 锁：同一个目录已经有一个 dev server 在跑） */
const devLog = [];
const DEV_LOG_LINES = 20;

async function waitForHealth(base) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastError = 'no attempt';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const tail = devLog.length > 0 ? `\ndev server 最后 ${devLog.length} 行输出：\n${devLog.join('\n')}` : '';
  throw new Error(`等待 ${base}/api/health 超时（最后一次：${lastError}）${tail}`);
}

async function startDevServer() {
  const port = 3400 + Math.floor(Math.random() * 200);
  BASE = `http://127.0.0.1:${port}`;
  tempDir = mkdtempSync(join(tmpdir(), 'hbcol-e2e-'));
  console.log(`启动 nuxt dev：${BASE}（库 ${join(tempDir, 'collector.db')}）`);
  child = spawn('npx', ['nuxt', 'dev', '--port', String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      COLLECTOR_PORT: String(port),
      COLLECTOR_HOST: '127.0.0.1',
      COLLECTOR_DB_FILE_PATH: join(tempDir, 'collector.db'),
      COLLECTOR_ADMIN_USERNAME: ADMIN_USERNAME,
      COLLECTOR_ADMIN_PASSWORD: ADMIN_PASSWORD,
      // 把登录限流压到 5 次/分钟：限流用例否则要打十几次错误口令（也就把窗口耗掉了）
      COLLECTOR_LOGIN_RATE_LIMIT: String(LOGIN_RATE_LIMIT),
      COLLECTOR_LOGIN_RATE_WINDOW_MS: '60000',
      NUXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    // 自成进程组：stopDevServer() 靠 `process.kill(-pid)` 把 nuxt dev 一起带走，
    // 否则会留下占端口、并且持有 dev 锁的孤儿进程（见 stopDevServer 的注释）。
    detached: true,
  });
  const verbose = process.env.COLLECTOR_E2E_VERBOSE === 'true';
  const collect = (chunk) => {
    const text = String(chunk);
    if (verbose) process.stdout.write(`[dev] ${text}`);
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue;
      devLog.push(line);
      if (devLog.length > DEV_LOG_LINES) devLog.shift();
    }
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  await waitForHealth(BASE);
}

async function stopDevServer() {
  if (child) {
    // 必须杀**整棵进程树**：spawn 出去的是 `npx`（只是包装），真正的 `nuxt dev` 是它的子进程；
    // 只 kill 包装进程会留下一个孤儿 —— 它占着端口，而且对项目目录持有 Nuxt 的 dev 锁，
    // 下一次 `npm run test:e2e` 会以"Another Nuxt dev server is already running"收场。
    // 所以 spawn 时开了 detached（自成一个进程组），这里按进程组发信号。
    const groupKill = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {
        try {
          child.kill(signal);
        } catch {
          // 已经死了：忽略
        }
      }
    };
    groupKill('SIGTERM');
    // 发完信号要**等整个进程组真的消失**再往下走：spawn 出去的是 `npx`（包装进程），
    // 它收到 SIGTERM 立刻退出，而真正的 `nuxt dev` 还在做 Vite/Nitro 的关闭动作 ——
    // 只等包装进程退出（更别说直接 process.exit()）就会留下一个还占着端口的孤儿。
    // 探测手段：对进程组发 0 号信号，组里还有活人就抛 ESRCH 以外的错。
    const groupAlive = () => {
      try {
        process.kill(-child.pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    for (let i = 0; i < 30 && groupAlive(); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (groupAlive()) {
      groupKill('SIGKILL');
      for (let i = 0; i < 20 && groupAlive(); i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
}

/** 从 call() 的结果里取出会话 cookie 的 "名=值"（没有就返回 null）；用于第二个会话这种临时 jar */
function cookiePairFrom(response) {
  const list = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  for (const raw of list) {
    const pair = raw.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq < 0 || pair.slice(0, eq).trim() !== SESSION_COOKIE_NAME) continue;
    if (pair.slice(eq + 1) === '' || /max-age=0/i.test(raw)) return null;
    return pair;
  }
  return null;
}

/** 把响应里的会话 cookie 记下来（httpOnly 只是"JS 读不到"，脚本作为客户端当然能转发它） */
function captureCookie(response) {
  const list = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  for (const raw of list) {
    const pair = raw.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq < 0 || pair.slice(0, eq).trim() !== SESSION_COOKIE_NAME) continue;
    const cleared = pair.slice(eq + 1) === '' || /max-age=0/i.test(raw);
    sessionCookie = cleared ? null : pair;
  }
}

/**
 * 发一个请求。
 * `cookie` 用来临时改用别的会话（"第二台设备"）：给了它就不会自动记/覆盖全局的 sessionCookie，
 * 传 null 表示"这次不带 cookie"。
 */
async function call(path, { method = 'GET', body, key, admin, cookie, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h['content-type'] = 'application/json';
  if (key) h['x-collector-key'] = key;
  const sentCookie = cookie !== undefined ? cookie : admin ? sessionCookie : null;
  if (sentCookie) h.cookie = sentCookie;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (cookie === undefined) captureCookie(response);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text, headers: response.headers };
}

async function main() {
  if (!EXTERNAL_BASE) await startDevServer();

  const stamp = Date.now().toString(36).toUpperCase();
  const BARCODE_A = `E2E${stamp}A`;
  const BARCODE_B = `E2E${stamp}B`;

  // 1. 健康检查与页面
  const health = await call('/api/health');
  check('健康检查', health.status === 200 && health.json?.status === 'ok', `${health.status} ${health.json?.service}`);
  const root = await call('/');
  check('根路径是 SSR 页面', root.status === 200 && /<html/i.test(root.text) && root.text.includes('收集器'), `${root.status} ${root.text.length}B`);
  const statsPage = await call('/stats');
  check('公开页面可直达（SSR，不是空壳）', statsPage.status === 200 && /<html/i.test(statsPage.text), `${statsPage.status}`);
  const adminPage = await call('/admin');
  check('纠错台页面可直达', adminPage.status === 200 && /<html/i.test(adminPage.text), `${adminPage.status}`);
  const assetPath = root.text.match(/src="(\/_nuxt\/[^"]+\.js)"/)?.[1] ?? root.text.match(/href="(\/_nuxt\/[^"]+\.js)"/)?.[1];
  const asset = assetPath ? await call(assetPath) : { status: 0, headers: new Headers() };
  check('前端资源按 JS 的 MIME 返回', asset.status === 200 && /javascript/.test(asset.headers.get('content-type') ?? ''), `${assetPath} → ${asset.status} ${asset.headers.get('content-type')}`);
  const missingAsset = await call('/_nuxt/does-not-exist.js');
  check('不存在的产物 → 404', missingAsset.status === 404, `→ ${missingAsset.status}`);

  // 2. 实例自我注册
  const reg1 = await call('/api/v1/instances', { method: 'POST', body: { name: 'E2E 一号机', platform: 'linux', version: '0.1.0' } });
  check('实例自我注册', reg1.status === 201 && /^hbc_[0-9a-f]{40}$/.test(reg1.json?.key ?? ''), `${reg1.status} ${reg1.json?.keyPrefix}`);
  const key1 = reg1.json?.key;
  const reg2 = await call('/api/v1/instances', { method: 'POST', body: { name: 'E2E 二号机' } });
  const key2 = reg2.json?.key;
  check('第二个实例独立注册', reg2.status === 201 && key2 !== key1);
  const me = await call('/api/v1/instances/me', { key: key1 });
  check('实例自查（不回明文密钥）', me.status === 200 && me.json?.name === 'E2E 一号机' && me.json?.key === undefined);

  // 3. 鉴权边界
  const noKey = await call('/api/v1/contributions', { method: 'POST', body: { barcode: BARCODE_A, name: 'x' } });
  check('缺密钥上报 → 401 instance.keyMissing', noKey.status === 401 && noKey.json?.code === 'instance.keyMissing', `${noKey.status} ${noKey.json?.code}`);
  const badKey = await call('/api/v1/contributions', { method: 'POST', key: 'hbc_deadbeef', body: { barcode: BARCODE_A, name: 'x' } });
  check('错密钥上报 → 401 instance.keyInvalid', badKey.status === 401 && badKey.json?.code === 'instance.keyInvalid');
  const noIdentity = await call('/api/v1/contributions', { method: 'POST', key: key1, body: { description: '既没条码也没名字' } });
  check('既无条码也无指纹 → 400 contribution.identityMissing', noIdentity.status === 400 && noIdentity.json?.code === 'contribution.identityMissing');
  const badBarcode = await call('/api/v1/contributions', { method: 'POST', key: key1, body: { barcode: 'ab' } });
  check('条码格式非法 → 400 contribution.barcodeInvalid', badBarcode.status === 400 && badBarcode.json?.code === 'contribution.barcodeInvalid');

  // 4. 首次上报建档
  const c1 = await call('/api/v1/contributions', {
    method: 'POST',
    key: key1,
    body: {
      barcode: BARCODE_A,
      name: '冲击钻',
      model: 'GSB 18V',
      manufacturer: 'Bosch',
      baseUnit: '台',
      imageUrls: ['https://example.com/a.jpg'],
      attributes: { 电压: '18V', 电池: '2.0Ah' },
    },
  });
  check('首次上报建档', c1.status === 201 && c1.json?.created === true && c1.json?.item?.name === '冲击钻', `${c1.status} applied=${JSON.stringify(c1.json?.applied)}`);
  const itemId = c1.json?.item?.id;

  // 5. 第二个实例补字段 + 更早的观测不覆盖
  const c2 = await call('/api/v1/contributions', {
    method: 'POST',
    key: key2,
    body: { barcode: BARCODE_A, category: '电动工具', description: '18V 无刷冲击钻' },
  });
  check('第二个实例补齐字段', c2.status === 201 && c2.json?.created === false && c2.json?.item?.category === '电动工具', `applied=${JSON.stringify(c2.json?.applied)}`);
  const stale = await call('/api/v1/contributions', {
    method: 'POST',
    key: key2,
    body: { barcode: BARCODE_A, name: '旧名字', observedAt: '2020-01-01T00:00:00.000Z' },
  });
  check('更早的观测不覆盖当前值', stale.json?.item?.name === '冲击钻' && Array.isArray(stale.json?.applied) && stale.json.applied.length === 0);

  // 6. 公开查询
  const search = await call(`/api/v1/items?q=${encodeURIComponent('冲击')}&page=1&pageSize=10`);
  check('关键词搜索', search.status === 200 && search.json?.total === 1 && search.json?.items?.[0]?.manufacturer === 'Bosch', `total=${search.json?.total}`);
  const detail = await call(`/api/v1/items/${BARCODE_A}`);
  check(
    '按条码查详情（含每字段来源）',
    detail.status === 200 && detail.json?.identityKey === `barcode:${BARCODE_A}` && detail.json?.fields?.length > 0,
    `fields=${detail.json?.fields?.length}`,
  );
  const nameField = detail.json?.fields?.find((f) => f.field === 'name');
  check('字段来源指向具体实例', nameField?.instanceName === 'E2E 一号机' && nameField?.agreedBy === 1, `${nameField?.instanceName} agreedBy=${nameField?.agreedBy}`);
  const attrs = detail.json?.fields?.filter((f) => f.field.startsWith('attributes.'));
  check('attributes 逐键竞争', attrs?.length === 2, `${attrs?.length} 个属性字段`);
  const hist = await call(`/api/v1/items/${BARCODE_A}/contributions?page=1&pageSize=10`);
  check('上报记录分页且按观测时间倒序', hist.status === 200 && hist.json?.total === 3, `total=${hist.json?.total}`);
  check('上报记录带实例名与来源', hist.json?.contributions?.[0]?.instanceName === 'E2E 二号机' && hist.json?.contributions?.[0]?.source === 'api');
  const notFound = await call('/api/v1/items/NOSUCHBARCODE');
  check('不存在的条码 → 404 item.notFound', notFound.status === 404 && notFound.json?.code === 'item.notFound');
  const stats = await call('/api/v1/stats');
  check('统计概览', stats.status === 200 && stats.json?.totals?.items === 1 && stats.json?.totals?.contributions === 3, `items=${stats.json?.totals?.items}`);

  // 7. 管理端登录：账号 + 口令 → httpOnly 会话 cookie（旧版是 x-admin-token 请求头）
  const loginPage = await call('/login');
  check('登录页可直达（SSR）', loginPage.status === 200 && /<html/i.test(loginPage.text), `${loginPage.status}`);
  const passwordPage = await call('/password');
  check('改密码页可直达（SSR）', passwordPage.status === 200 && /<html/i.test(passwordPage.text), `${passwordPage.status}`);
  const anonymousSession = await call('/api/admin/session');
  check('未登录 → 401 admin.sessionMissing', anonymousSession.status === 401 && anonymousSession.json?.code === 'admin.sessionMissing', `${anonymousSession.status} ${anonymousSession.json?.code}`);
  const forged = await call('/api/admin/session', { headers: { cookie: `${SESSION_COOKIE_NAME}=hbs_${'0'.repeat(40)}` } });
  check('伪造会话 cookie → 401 admin.sessionInvalid', forged.status === 401 && forged.json?.code === 'admin.sessionInvalid', `${forged.status} ${forged.json?.code}`);
  const badLogin = await call('/api/admin/login', { method: 'POST', body: { username: ADMIN_USERNAME, password: 'definitely-not-the-password' } });
  check('口令错误 → 401 admin.badCredentials', badLogin.status === 401 && badLogin.json?.code === 'admin.badCredentials', `${badLogin.status} ${badLogin.json?.code}`);
  check('登录失败不发放会话', sessionCookie === null && !badLogin.headers.get('set-cookie'));
  const login = await call('/api/admin/login', { method: 'POST', body: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD } });
  const loginSetCookie = login.headers.getSetCookie().join('; ');
  check(
    '登录成功 → 200 + user + httpOnly/SameSite cookie',
    login.status === 200 &&
      login.json?.user?.username === ADMIN_USERNAME &&
      typeof login.json?.expiresAt === 'string' &&
      new RegExp(`^${SESSION_COOKIE_NAME}=hbs_`).test(sessionCookie ?? '') &&
      /HttpOnly/i.test(loginSetCookie) &&
      /SameSite=Lax/i.test(loginSetCookie),
    `user=${login.json?.user?.username} cookie=${sessionCookie ? 'yes' : 'no'}`,
  );
  const session = await call('/api/admin/session', { admin: true });
  check('带会话 cookie 访问纠错台', session.status === 200 && session.json?.ok === true && session.json?.user?.username === ADMIN_USERNAME, JSON.stringify(session.json?.user));

  // 8. 老契约（已部署实例的 DATA_COLLECTION_ENDPOINT，无凭据）
  const legacyLookup = await call(`/api/v1/barcodes/${BARCODE_A}`);
  check('老契约查询：200 + 原样回显条码', legacyLookup.status === 200 && legacyLookup.json?.barcode === BARCODE_A, `${legacyLookup.status} ${legacyLookup.json?.barcode}`);
  // 置信度 = 赞同票 / (可比票数 + 1)：此时该条码有 3 条可见上报（c1 全字段、c2 分类、一条 2020 年的
  // 「旧名字」），3 条都"可比"，其中 c1、c2 与当前值一致、旧名字那条不一致 → 2/(3+1) = 0.5。
  // （旧脚本断言 0.67 是因为它的数据集只有 2 条且都一致 → 2/(2+1)；照抄数字会与数据集脱节。）
  check(
    '老契约查询：confidence/sources 是收缩估计',
    legacyLookup.json?.confidence === 0.5 && legacyLookup.json?.sources === 3,
    `confidence=${legacyLookup.json?.confidence} sources=${legacyLookup.json?.sources}`,
  );
  const legacyMissing = await call('/api/v1/barcodes/NOSUCHBARCODE');
  check('老契约查询未收录 → 404', legacyMissing.status === 404 && legacyMissing.json?.code === 'item.notFound');
  const legacyPost = await call('/api/v1/observations', {
    method: 'POST',
    body: { barcode: BARCODE_B, name: '无绳电锤', manufacturer: 'Bosch', category: '电动工具', clientVersion: 'homebucket/1' },
  });
  check('老契约上报：无凭据也接受（200）', legacyPost.status === 200 && legacyPost.json?.accepted === true && legacyPost.json?.created === true, `${legacyPost.status} applied=${JSON.stringify(legacyPost.json?.applied)}`);
  const legacyAudit = await call(`/api/admin/contributions?itemId=${legacyPost.json?.item?.id}`, { admin: true });
  const anonymous = legacyAudit.json?.contributions?.[0];
  check('匿名上报在审计里可见（source=api，没有实例）', anonymous?.source === 'api' && anonymous?.instanceId === null, `source=${anonymous?.source} instanceId=${anonymous?.instanceId}`);

  // 9. 纠错台人工改字段
  const patched = await call(`/api/admin/items/${itemId}`, {
    method: 'PATCH',
    admin: true,
    body: { name: '冲击钻（人工校正）', manufacturer: 'Bosch 博世', lockedFields: ['name'], note: 'e2e 人工纠错' },
  });
  check('人工改字段并存锁定', patched.status === 200 && patched.json?.item?.name === '冲击钻（人工校正）' && patched.json?.item?.lockedFields?.includes('name'), `applied=${JSON.stringify(patched.json?.applied)}`);
  const afterLock = await call('/api/v1/contributions', { method: 'POST', key: key1, body: { barcode: BARCODE_A, name: '实例又想改名' } });
  check('锁定字段挡住实例上报', afterLock.json?.item?.name === '冲击钻（人工校正）' && Array.isArray(afterLock.json?.applied) && afterLock.json.applied.length === 0);

  const cleared = await call(`/api/admin/items/${itemId}`, { method: 'PATCH', admin: true, body: { clearFields: ['description'] } });
  check('人工清空字段', cleared.json?.item?.description === null, `description=${JSON.stringify(cleared.json?.item?.description)}`);

  // 10. 屏蔽上报 → 值回退
  const latest = await call(`/api/admin/contributions?itemId=${itemId}&pageSize=50`, { admin: true });
  const target = latest.json?.contributions?.find((c) => c.appliedFields?.includes('category'));
  check('纠错台能看到上报流水', Array.isArray(latest.json?.contributions) && latest.json?.contributions.length > 0, `${latest.json?.contributions?.length} 条`);
  const blocked = await call(`/api/admin/contributions/${target.id}/block`, { method: 'POST', admin: true, body: { blocked: true, reason: 'e2e 屏蔽测试' } });
  check('屏蔽上报', blocked.status === 200 && blocked.json?.contribution?.blocked === true, `code=${blocked.json?.code}`);
  const afterBlock = await call(`/api/v1/items/${BARCODE_A}`);
  check('屏蔽后该值从台面消失', afterBlock.json?.category === null, `category=${JSON.stringify(afterBlock.json?.category)}`);
  const unblocked = await call(`/api/admin/contributions/${target.id}/block`, { method: 'POST', admin: true, body: { blocked: false } });
  check('恢复上报', unblocked.status === 200 && (await call(`/api/v1/items/${BARCODE_A}`)).json?.category === '电动工具');

  // 11. 合并重复物品
  const dupSource = await call('/api/v1/contributions', { method: 'POST', key: key2, body: { barcode: BARCODE_B, name: '冲击钻（重复条目）', manufacturer: 'Bosch 博世' } });
  const dupId = dupSource.json?.item?.id;
  check('重复条目并入老条目', dupSource.status === 201 && dupId !== itemId, `dup=${dupId}`);
  const merged = await call(`/api/admin/items/${itemId}/merge`, { method: 'POST', admin: true, body: { sourceItemId: dupId } });
  check('合并重复物品', merged.status === 200 && merged.json?.source?.mergedIntoId === itemId, `target=${merged.json?.target?.id}`);
  const mergeSelf = await call(`/api/admin/items/${itemId}/merge`, { method: 'POST', admin: true, body: { sourceItemId: itemId } });
  check('自己并自己 → 400 item.mergeSelf', mergeSelf.status === 400 && mergeSelf.json?.code === 'item.mergeSelf');
  const mergeAgain = await call(`/api/admin/items/${itemId}/merge`, { method: 'POST', admin: true, body: { sourceItemId: dupId } });
  check('重复合并 → 409 item.alreadyMerged', mergeAgain.status === 409 && mergeAgain.json?.code === 'item.alreadyMerged', `${mergeAgain.status} ${mergeAgain.json?.code}`);
  const mergedOutline = await call(`/api/v1/items?q=${encodeURIComponent('冲击钻')}`);
  check('公开列表不含被并条目', mergedOutline.json?.items?.every((i) => i.id === itemId), `items=${mergedOutline.json?.items?.length}`);
  const adminList = await call(`/api/admin/items?q=${encodeURIComponent('冲击钻')}`, { admin: true });
  check('纠错台仍能看到被并条目', adminList.json?.items?.some((i) => i.id === dupId && i.mergedIntoId === itemId));

  // 12. 封禁实例 → 重放
  const instances = await call('/api/admin/instances', { admin: true });
  const inst2 = instances.json?.instances?.find((i) => i.name === 'E2E 二号机');
  check('纠错台能看到实例列表', instances.status === 200 && instances.json?.instances?.length === 2, `${instances.json?.instances?.length} 个实例`);
  const blockInst = await call(`/api/admin/instances/${inst2.id}/block`, { method: 'POST', admin: true, body: { blocked: true, reason: 'e2e 封禁测试' } });
  check('封禁实例并重放', blockInst.status === 200 && blockInst.json?.instance?.blocked === true, `recomputed=${blockInst.json?.recomputedItems}`);
  const afterBan = await call('/api/v1/instances/me', { key: key2 });
  check('被封实例不能用密钥', afterBan.status === 403 && afterBan.json?.code === 'instance.blocked', `${afterBan.status} ${afterBan.json?.code}`);
  const instPatch = await call(`/api/admin/instances/${inst2.id}/block`, { method: 'POST', admin: true, body: { blocked: false } });
  check('解封实例', instPatch.json?.instance?.blocked === false);
  const afterUnban = await call('/api/v1/instances/me', { key: key2 });
  check('解封后密钥恢复可用', afterUnban.status === 200);

  // 13. 全库重放、兜底路由、CORS
  const recompute = await call('/api/admin/recompute', { method: 'POST', admin: true });
  check('全库重放（只重放未被并的主条目）', recompute.status === 200 && recompute.json?.items === 1, `items=${recompute.json?.items}`);
  const singleRecompute = await call(`/api/admin/items/${itemId}/recompute`, { method: 'POST', admin: true });
  check('单条目重放', singleRecompute.status === 200);
  const jsonNotFound = await call('/api/nope');
  check('未知 API → JSON 404 route.notFound', jsonNotFound.status === 404 && jsonNotFound.json?.code === 'route.notFound');
  const wrongMethod = await call('/api/v1/items', { method: 'POST', body: {} });
  check('方法不对 → JSON 404', wrongMethod.status === 404 && wrongMethod.json?.code === 'route.notFound', `${wrongMethod.status} ${wrongMethod.json?.code}`);
  // 注意：Nuxt 会按 Accept 头做内容协商 —— 不带 text/html 时未知页面回 JSON 错误体（curl 的默认行为）。
  // 浏览器一定带，所以这里也要带，否则断言的是我们并不关心的那条分支。
  const deepLink = await call('/nope/deep/link', { headers: { accept: 'text/html' } });
  check('未知页面 → 404 页面（不是 API JSON）', deepLink.status === 404 && /<html/i.test(deepLink.text), `${deepLink.status}`);
  const cors = await call('/api/health', { headers: { origin: 'https://example.com' } });
  check('公开接口带 CORS 头', cors.headers.get('access-control-allow-origin') === '*', cors.headers.get('access-control-allow-origin'));
  const preflight = await fetch(`${BASE}/api/v1/items`, { method: 'OPTIONS', headers: { origin: 'https://example.com' } });
  check('预检请求 → 204', preflight.status === 204, `${preflight.status}`);

  // 14. 改密码：要当前口令；成功后**其它会话全部作废**（"怀疑别人登进来了"的处置动作）
  // 用第二个会话（模拟"另一台设备"）来操作，这样才能验证"当前这条留着、别的被踢掉"。
  const secondLogin = await call('/api/admin/login', {
    method: 'POST',
    cookie: null, // 别让第二个 jar 覆盖主 jar
    body: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  });
  const secondCookie = cookiePairFrom(secondLogin);
  check(
    '第二个会话登录成功（另一台设备）',
    secondLogin.status === 200 && secondCookie !== null && secondCookie !== sessionCookie,
    `${secondLogin.status} cookie=${secondCookie ? 'yes' : 'no'}`,
  );
  const otherSession = await call('/api/admin/session', { cookie: secondCookie });
  check('第二个会话可用', otherSession.status === 200 && otherSession.json?.user?.username === ADMIN_USERNAME, `${otherSession.status}`);

  const wrongCurrent = await call('/api/admin/password', {
    method: 'POST',
    cookie: secondCookie,
    body: { currentPassword: 'definitely-not-the-password', newPassword: 'whatever-but-long-enough' },
  });
  check(
    '当前口令不对 → 400 admin.badCurrentPassword',
    wrongCurrent.status === 400 && wrongCurrent.json?.code === 'admin.badCurrentPassword',
    `${wrongCurrent.status} ${wrongCurrent.json?.code}`,
  );
  const shortNew = await call('/api/admin/password', {
    method: 'POST',
    cookie: secondCookie,
    body: { currentPassword: ADMIN_PASSWORD, newPassword: 'short' },
  });
  check('新口令太短 → 400 validation.failed', shortNew.status === 400 && shortNew.json?.code === 'validation.failed', `${shortNew.status} ${shortNew.json?.code}`);

  const ROTATED_PASSWORD = `${ADMIN_PASSWORD}-rotated`;
  const changed = await call('/api/admin/password', {
    method: 'POST',
    cookie: secondCookie,
    body: { currentPassword: ADMIN_PASSWORD, newPassword: ROTATED_PASSWORD },
  });
  check(
    '改密码成功并吊销其它会话',
    changed.status === 200 && changed.json?.ok === true && changed.json?.revokedSessions >= 1,
    `${changed.status} revoked=${changed.json?.revokedSessions}`,
  );
  const sameAgain = await call('/api/admin/password', {
    method: 'POST',
    cookie: secondCookie,
    body: { currentPassword: ROTATED_PASSWORD, newPassword: ROTATED_PASSWORD },
  });
  check('新旧口令相同 → 400 admin.passwordUnchanged', sameAgain.status === 400 && sameAgain.json?.code === 'admin.passwordUnchanged', `${sameAgain.status} ${sameAgain.json?.code}`);
  const keptSession = await call('/api/admin/session', { cookie: secondCookie });
  check('改密码的这条会话保留', keptSession.status === 200, `${keptSession.status}`);
  const kickedSession = await call('/api/admin/session', { cookie: sessionCookie });
  check(
    '其它设备的会话被踢下线 → 401',
    kickedSession.status === 401 && ['admin.sessionInvalid', 'admin.sessionExpired'].includes(kickedSession.json?.code),
    `${kickedSession.status} ${kickedSession.json?.code}`,
  );
  // 校验"旧口令已经失效"时不用再登一次（登录要占限流额度，且这里要留额度给下面的重登）：
  // 拿旧口令当 currentPassword 去改密，服务端必须认不出来 → admin.badCurrentPassword。
  const oldPassword = await call('/api/admin/password', {
    method: 'POST',
    cookie: secondCookie,
    body: { currentPassword: ADMIN_PASSWORD, newPassword: 'another-long-enough-one' },
  });
  check(
    '旧口令不再被认可 → 400 admin.badCurrentPassword',
    oldPassword.status === 400 && oldPassword.json?.code === 'admin.badCurrentPassword',
    `${oldPassword.status} ${oldPassword.json?.code}`,
  );

  // 把口令改回初始值：脚本要能反复跑，也给下面的登出/限流用例留下可用口令。
  const restore = await call('/api/admin/password', {
    method: 'POST',
    cookie: secondCookie,
    body: { currentPassword: ROTATED_PASSWORD, newPassword: ADMIN_PASSWORD },
  });
  check('改回初始口令（脚本可重复运行）', restore.status === 200 && restore.json?.ok === true, `${restore.status} ${restore.json?.code}`);
  const relogin = await call('/api/admin/login', { method: 'POST', body: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD } });
  check('用初始口令重新登录成功', relogin.status === 200 && sessionCookie !== null, `${relogin.status}`);

  // 15. 退出登录与登录限流
  // 必须放在最后：限流用的是固定窗口（自拉进程时设成 5 次/分钟），把窗口打满之后
  // 本进程里再没人能登录 —— 前面任何一个用例需要登录都会被它误伤。
  const logout = await call('/api/admin/logout', { method: 'POST', admin: true });
  check('退出登录 → 200 且清掉 cookie', logout.status === 200 && logout.json?.ok === true && sessionCookie === null, `revoked=${logout.json?.revoked}`);
  const afterLogout = await call('/api/admin/session', { admin: true });
  check('退出后访问纠错台 → 401 admin.sessionMissing', afterLogout.status === 401 && afterLogout.json?.code === 'admin.sessionMissing', `${afterLogout.status} ${afterLogout.json?.code}`);

  let lastAttempt = null;
  let sawRateLimit = false;
  for (let i = 0; i < LOGIN_RATE_LIMIT + 3 && !sawRateLimit; i += 1) {
    lastAttempt = await call('/api/admin/login', { method: 'POST', body: { username: ADMIN_USERNAME, password: `wrong-${i}` } });
    if (lastAttempt.status === 429) sawRateLimit = true;
  }
  check(
    '登录尝试超限 → 429 rate.tooMany + retryAfterSeconds',
    sawRateLimit && lastAttempt?.json?.code === 'rate.tooMany' && Number(lastAttempt?.json?.retryAfterSeconds) > 0 && Boolean(lastAttempt?.headers.get('retry-after')),
    `status=${lastAttempt?.status} code=${lastAttempt?.json?.code}`,
  );
}

try {
  await main();
} catch (error) {
  fail += 1;
  failures.push('未捕获异常');
  console.error('未捕获异常：', error);
} finally {
  await stopDevServer();
}

console.log(`\n结果: ${pass}/${pass + fail} 通过${fail ? `，失败：${failures.join('、')}` : ''}`);
process.exit(fail ? 1 : 0);
