import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from '../config/env';

/** 定位 prisma CLI（devDependencies 里的 prisma 包） */
function locateCli(): string | null {
  try {
    return require.resolve('prisma/build/index.js');
  } catch {
    const fallback = resolve(process.cwd(), 'node_modules/prisma/build/index.js');
    return existsSync(fallback) ? fallback : null;
  }
}

/**
 * 启动时自动执行 `prisma migrate deploy`：
 * 让空库 / 首次启动也能自动建表，避免 Prisma 查询到不存在的表导致启动即失败。
 * 幂等：已应用过的迁移不会重复执行；失败只打日志，不阻断进程（/health 会显示 degraded）。
 */
export function autoMigrate(): void {
  const schema = resolve(process.cwd(), 'prisma', env.dbProvider, 'schema.prisma');
  if (!existsSync(schema)) {
    console.error(`[migrate] 找不到 schema：${schema}，跳过自动迁移`);
    return;
  }

  const cli = locateCli();
  if (!cli) {
    console.error('[migrate] 找不到 prisma CLI（请在 server/ 下安装依赖），跳过自动迁移');
    return;
  }

  try {
    const output = execFileSync(
      process.execPath,
      [cli, 'migrate', 'deploy', '--schema', schema],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    console.log(`[migrate] ${output.trim() || 'no pending migrations'}`);
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    console.error(`[migrate] 迁移失败：${err.stderr?.trim() || err.stdout?.trim() || err.message}`);
  }
}
