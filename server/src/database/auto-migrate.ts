import { DataSource } from 'typeorm';
import { env } from '../config/env';
import { buildDataSourceOptions } from './data-source';

/**
 * 启动时执行数据库迁移（对应原来的 prisma migrate deploy）。
 *
 * 与改造前的区别：不再 `child_process` 去调 Prisma CLI，而是直接用 TypeORM 自带的
 * 迁移执行器。带来两个好处：
 *   1. 运行期镜像不再需要 devDependencies（原来为了调 CLI 必须整包带走）
 *   2. 少一次 Node 进程启动 + 一次 schema 生成，启动更快
 *
 * 用独立的 DataSource 而不是 Nest 里那个：这样迁移在 NestFactory.create() 之前就已完成，
 * 后面的 bootstrapAdmin（首次启动建管理员）才能安全地查表。
 *
 * 失败时抛出，由调用方决定是否阻断启动（main.ts 里只记日志，让 /health 报 degraded）。
 */
export async function runMigrations(): Promise<void> {
  const options = buildDataSourceOptions();
  const dataSource = new DataSource(options);
  const provider = env.dbProvider;

  try {
    await dataSource.initialize();

    if (!(await dataSource.showMigrations())) {
      console.log(`[migrate] provider=${provider} 没有待执行的迁移`);
      return;
    }

    const executed = await dataSource.runMigrations({ transaction: 'all' });
    const names = executed.map((migration) => migration.name).join(', ');
    console.log(`[migrate] provider=${provider} 已执行 ${executed.length} 个迁移：${names}`);
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}
