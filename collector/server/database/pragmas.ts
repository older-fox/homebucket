import type { DataSource } from 'typeorm';

/**
 * SQLite 连接参数（公开服务的基本盘）。
 *
 * ── WAL ──
 * 默认 rollback journal 模式下写事务会阻塞所有读。收集器是"读远多于写"
 * （各实例随时查询、偶尔上报），WAL 让读写在同一个库上并行，是最划算的一处调优。
 * ── synchronous = NORMAL ──
 * WAL 下只在 checkpoint 时 fsync，断电最多丢掉最后一个事务。收集器存的是
 * "可以被重新上报的公共资料"，不值得为它付 FULL 的写放大。
 * ── busy_timeout ──
 * 并发写不要立刻抛 SQLITE_BUSY，等 5 秒再放弃：上报是低频写，
 * 让重试发生在驱动内部比让每个实例自己重试简单得多。
 *
 * pragma 是**会话级**的，必须在真正在用的那条连接上执行才生效 ——
 * 所以由 initDatabase() 在 initialize() 之后立刻调用。
 */
export const SQLITE_PRAGMAS = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA synchronous = NORMAL',
  'PRAGMA busy_timeout = 5000',
] as const;

export async function applyPragmas(dataSource: DataSource): Promise<void> {
  if (dataSource.options.type !== 'better-sqlite3') return;
  for (const pragma of SQLITE_PRAGMAS) {
    await dataSource.query(pragma);
  }
}
