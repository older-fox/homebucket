/**
 * 一条命令起开发环境：nest --watch（服务端）+ vite（前端）。
 * 不引 concurrently 之类的依赖 —— 这个项目就这两个进程，spawn 一下够了；
 * 任一个退出就一起收工，Ctrl+C 也会转发给子进程。
 */
import { spawn } from 'node:child_process';

const children = [];

function run(name, command, args) {
  const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'], shell: false });
  child.on('exit', (code) => {
    console.log(`[dev] ${name} 退出（code=${code}），一起收工`);
    shutdown(code ?? 0);
  });
  children.push(child);
}

let closing = false;
function shutdown(code) {
  if (closing) return;
  closing = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 200);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run('server', 'npx', ['nest', 'start', '--watch']);
run('web', 'npx', ['vite']);
