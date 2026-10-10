/**
 * 护栏：server 的 npm ci 必须带 --ignore-scripts。
 *
 * 事故背景：Dockerfile 里两处 server 安装早就带着这个参数（注释也写明了原因），
 * 后来新增的 CI `check:types` 阶段漏了它。于是流水线第一次在真实 runner 上跑起来时，
 * `better-sqlite3` 的隐含 `node-gyp rebuild` 在 slim 基础镜像里找不到 Python，直接
 *   gyp ERR! find Python … Could not find any Python installation to use
 * 把 job 掐死在装依赖这一步，后面的 typecheck / 漂移探针 / 测试一个都没跑到。
 *
 * 这个参数无法靠「跑一遍测试」发现 —— 只有换台没有工具链的机器才会暴露，所以这里
 * 直接读配置文件断言，把两个文件钉在一起。改动 CI 或 Dockerfile 的安装命令时，
 * 若把参数丢了，`cd server && npm test` 会立刻变红。
 *
 * 运行：cd server && npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * 找出文件里所有安装 server 依赖的 `npm ci` 命令。
 *
 * 两种写法都要认：
 *   · Dockerfile        `cd server && npm ci …`（同行）
 *   · .gitlab-ci.yml    `- cd server` 之后另起一行 `- npm ci …`（可能隔着注释）
 * 返回 [{ line, command, dir }]。
 */
function findServerInstalls(text, file) {
  const found = [];
  let lastCd = null;
  text.split(/\r?\n/).forEach((raw, index) => {
    const inline = raw.match(/cd\s+([^\s&;]+)\s*(?:&&|;)/);
    const bare = raw.match(/^\s*(?:-\s*)?cd\s+([^\s&;]+)\s*$/);
    const dir = inline ? inline[1] : bare ? bare[1] : lastCd;
    if (inline || bare) lastCd = dir;
    if (!/(^|\s)npm ci(\s|$)/.test(raw)) return;
    if ((dir ?? '').replace(/\/+$/, '').endsWith('server')) {
      found.push({ line: index + 1, dir, command: raw.trim(), file });
    }
  });
  return found;
}

const targets = [
  { file: '.gitlab-ci.yml', path: resolve(repoRoot, '.gitlab-ci.yml') },
  { file: 'Dockerfile', path: resolve(repoRoot, 'Dockerfile') },
];

const installs = targets.flatMap(({ file, path }) =>
  findServerInstalls(readFileSync(path, 'utf8'), file),
);

test('两个配置文件里都能找到安装 server 依赖的 npm ci（否则下面的断言是空跑）', () => {
  for (const { file } of targets) {
    const count = installs.filter((item) => item.file === file).length;
    assert.ok(count > 0, `${file} 里没找到 server 的 npm ci —— 解析规则可能过时了，请同步本测试`);
  }
  assert.ok(
    installs.length >= 3,
    `预期至少 3 处 server 安装（Dockerfile 的构建阶段与运行期各一处、CI 一处），实际 ${installs.length} 处`,
  );
});

test('server 的 npm ci 都带 --ignore-scripts（better-sqlite3 的隐含 node-gyp 在 slim 镜像里必失败）', () => {
  const offenders = installs.filter((item) => !item.command.includes('--ignore-scripts'));
  assert.deepEqual(
    offenders.map((item) => `${item.file}:${item.line} → ${item.command}`),
    [],
    '这些 server 的 npm ci 少了 --ignore-scripts：better-sqlite3 带 binding.gyp 且没有 install 脚本，' +
      'npm 会补跑 node-gyp rebuild，而 CI / 镜像的基础镜像既没有 Python 也没有编译器',
  );
});
