/**
 * 随机串与追溯码的契约测试（node:test，零依赖）。
 *
 * 追溯码是全系统跨端约定的格式：服务端生成 `HB-XXXX-XXXX`、DTO 用正则校验用户手填的值、
 * 扫码解析时按前缀识别、二维码里也写着它。生成器与 DTO 正则分处两个文件，很容易改一边
 * 忘另一边——这里直接从 DTO 源码里把正则抠出来，用真实生成结果去跑它。
 *
 * 运行：cd server && npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { randomToken, shortToken, traceCode } from '../src/common/id.ts';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, normalizePaging } from '../src/common/pagination.ts';

test('traceCode：形如 HB-XXXX-XXXX，且能被 DTO 的正则接受', () => {
  const dto = readFileSync(fileURLToPath(new URL('../src/items/dto.ts', import.meta.url)), 'utf8');
  const literal = /\^HB-\[[^\]]+\]\{4\}-\[[^\]]+\]\{4\}\$/.exec(dto);
  assert.ok(literal, '没能从 items/dto.ts 里找到追溯码正则，测试需要跟着更新');
  const pattern = new RegExp(literal[0]);

  for (let i = 0; i < 500; i += 1) {
    const code = traceCode();
    assert.match(code, /^HB-[0-9A-Z]{4}-[0-9A-Z]{4}$/, `生成结果形状不对：${code}`);
    assert.match(code, pattern, `生成结果被自己的 DTO 正则拒绝：${code}`);
    assert.equal(code.length, 12);
  }
});

test('traceCode：字符集去掉容易看错的 I / L / O / U，且取模无偏', () => {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  assert.equal(alphabet.length, 32, '长度必须整除 256，byte % length 才是无偏的');

  const seen = new Set();
  for (let i = 0; i < 2000; i += 1) {
    for (const ch of traceCode().replace(/^HB-|-/g, '')) seen.add(ch);
  }
  for (const ch of seen) {
    assert.ok(alphabet.includes(ch), `生成器出现了字符集外的字符：${ch}`);
  }
  for (const ch of 'ILOU') {
    assert.ok(!seen.has(ch), `不应该出现易混字符 ${ch}`);
  }
  assert.ok(seen.size >= 30, `2000 次采样应覆盖绝大部分字符集，实际 ${seen.size}`);
});

test('traceCode：家庭内唯一索引靠它，短时间内不能撞车', () => {
  const codes = new Set();
  for (let i = 0; i < 5000; i += 1) codes.add(traceCode());
  assert.equal(codes.size, 5000, '5000 次生成出现重复，碰撞概率过高');
});

test('shortToken：默认 9 字节 → 18 位小写 hex；shortToken(8) → 16 位', () => {
  assert.match(shortToken(), /^[0-9a-f]{18}$/);
  assert.match(shortToken(8), /^[0-9a-f]{16}$/, 'uploads 的 key 依赖这个长度');
  assert.match(shortToken(1), /^[0-9a-f]{2}$/);
  const many = new Set(Array.from({ length: 1000 }, () => shortToken(8)));
  assert.equal(many.size, 1000);
});

test('randomToken：默认 16 字节 base64url（URL 安全，不带 + / =）', () => {
  for (let i = 0; i < 200; i += 1) {
    const token = randomToken();
    assert.match(token, /^[A-Za-z0-9_-]+$/, `邀请链接里的 token 必须 URL 安全：${token}`);
    assert.equal(token.length, 22, '16 字节 base64url 去掉填充是 22 字符');
  }
  const many = new Set(Array.from({ length: 500 }, () => randomToken()));
  assert.equal(many.size, 500);
});

test('normalizePaging：page/pageSize 边界钳制，skip 由两者推导', () => {
  assert.deepEqual(normalizePaging(), { page: 1, pageSize: DEFAULT_PAGE_SIZE, skip: 0 });
  assert.deepEqual(normalizePaging(3, 20), { page: 3, pageSize: 20, skip: 40 });
  assert.deepEqual(
    normalizePaging(0, 0),
    { page: 1, pageSize: DEFAULT_PAGE_SIZE, skip: 0 },
    '0 / 负数走 `|| 默认值` 分支：页码下限是 1，pageSize=0 视为没传',
  );
  assert.deepEqual(normalizePaging(-5, -5), { page: 1, pageSize: 1, skip: 0 });
  assert.deepEqual(normalizePaging(2, 10_000), { page: 2, pageSize: MAX_PAGE_SIZE, skip: 500 }, '单页上限生效');
  assert.deepEqual(normalizePaging(1.9, 10.9), { page: 1, pageSize: 10, skip: 0 }, '先向下取整');
  assert.deepEqual(normalizePaging(Number.NaN, Number.NaN), { page: 1, pageSize: DEFAULT_PAGE_SIZE, skip: 0 });
  assert.deepEqual(normalizePaging(Number.POSITIVE_INFINITY, 50), {
    page: Number.POSITIVE_INFINITY,
    pageSize: 50,
    skip: Number.POSITIVE_INFINITY,
  }, '极大值不特殊处理：由数据库自己决定要不要报错');
});
