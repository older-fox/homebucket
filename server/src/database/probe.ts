import { DataSource, type DataSourceOptions } from 'typeorm';
import { buildDataSourceOptions } from './data-source';

/**
 * 数据库连通性探测。
 *
 * ── 为什么需要单独探一次，而不是"让迁移失败来告诉我" ──
 * 探测结果决定**用哪个根模块启动**（正常模式 vs 受限启动），所以它必须是一个明确的、
 * 只回答这一个问题的信号。靠 `runMigrations()` 抛错来推断会把"迁移 SQL 写错"也当成
 * "连不上库"，然后把一个数据库明明好好的实例拉进受限模式。
 *
 * ── 为什么必须自己设超时 ──
 * `TypeOrmModule.forRootAsync` 没配 `retryAttempts`，装好的 `@nestjs/typeorm` 默认
 * 重试 10 次 × 3s ≈ 27 秒才抛错；mysql2 自己的 connectTimeout 默认 10 秒。
 * 走 Nest 那条路的话，"没配数据库"的新实例要干等半分钟才看到引导页。
 */
const PROBE_TIMEOUT_MS = 3000;

export type ProbeResult = { ok: true } | { ok: false; reason: string };

export async function probeDatabase(timeoutMs = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
  const options = buildDataSourceOptions();
  const dataSource = new DataSource(withShortTimeout(options, timeoutMs));

  try {
    await dataSource.initialize();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

/** 给探测用的连接加一个短超时（MySQL 用 connectTimeout，SQLite 用 busy timeout） */
function withShortTimeout(options: DataSourceOptions, timeoutMs: number): DataSourceOptions {
  if (options.type === 'mysql') return { ...options, connectTimeout: timeoutMs } as DataSourceOptions;
  if (options.type === 'better-sqlite3') return { ...options, timeout: timeoutMs } as DataSourceOptions;
  return options;
}
