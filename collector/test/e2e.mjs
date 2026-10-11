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
const ADMIN = process.env.COLLECTOR_ADMIN_TOKEN ?? 'dev-admin-token';
const STARTUP_TIMEOUT_MS = Number(process.env.COLLECTOR_E2E_TIMEOUT_MS ?? 120_000);

let pass = 0;
let fail = 0;
const failures = [];

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
      COLLECTOR_ADMIN_TOKEN: ADMIN,
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

async function call(path, { method = 'GET', body, key, admin, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h['content-type'] = 'application/json';
  if (key) h['x-collector-key'] = key;
  if (admin) h['x-admin-token'] = ADMIN;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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

  // 7. 老契约（已部署实例的 DATA_COLLECTION_ENDPOINT，无凭据）
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

  // 8. 纠错台鉴权与人工改字段
  const adminNoToken = await call('/api/admin/session');
  check('纠错台无令牌 → 401 admin.tokenMissing', adminNoToken.status === 401 && adminNoToken.json?.code === 'admin.tokenMissing');
  const adminBadToken = await call('/api/admin/session', { headers: { 'x-admin-token': 'nope' } });
  check('纠错台错令牌 → 401 admin.tokenInvalid', adminBadToken.status === 401 && adminBadToken.json?.code === 'admin.tokenInvalid');
  const session = await call('/api/admin/session', { admin: true });
  check('纠错台会话', session.status === 200 && session.json?.ok === true, JSON.stringify(session.json));

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

  // 9. 屏蔽上报 → 值回退
  const latest = await call(`/api/admin/contributions?itemId=${itemId}&pageSize=50`, { admin: true });
  const target = latest.json?.contributions?.find((c) => c.appliedFields?.includes('category'));
  check('纠错台能看到上报流水', Array.isArray(latest.json?.contributions) && latest.json?.contributions.length > 0, `${latest.json?.contributions?.length} 条`);
  const blocked = await call(`/api/admin/contributions/${target.id}/block`, { method: 'POST', admin: true, body: { blocked: true, reason: 'e2e 屏蔽测试' } });
  check('屏蔽上报', blocked.status === 200 && blocked.json?.contribution?.blocked === true, `code=${blocked.json?.code}`);
  const afterBlock = await call(`/api/v1/items/${BARCODE_A}`);
  check('屏蔽后该值从台面消失', afterBlock.json?.category === null, `category=${JSON.stringify(afterBlock.json?.category)}`);
  const unblocked = await call(`/api/admin/contributions/${target.id}/block`, { method: 'POST', admin: true, body: { blocked: false } });
  check('恢复上报', unblocked.status === 200 && (await call(`/api/v1/items/${BARCODE_A}`)).json?.category === '电动工具');

  // 10. 合并重复物品
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

  // 11. 封禁实例 → 重放
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

  // 12. 全库重放、兜底路由、CORS
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
