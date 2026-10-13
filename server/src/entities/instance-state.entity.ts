import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 实例级的一次性状态（**单例行**）。
 *
 * 目前只有一个字段：`setupCompletedAt` —— 首次初始化引导是否已完成。
 *
 * ── 为什么单独一张表，而不塞进 `AppSetting` ──
 * `AppSetting` 的键语义是"环境变量名"，而 `setupCompletedAt` 不是环境变量。塞进去会污染两处：
 * 设置覆盖层里会多出一个永远不会被读取的键；那条"`env.ts` 里每个 `raw(X)` 都必须在注册表里"
 * 的防腐测试也会被它带偏。单行表的语义干净，也不需要任何索引。
 *
 * ── 为什么用"标记"而不是"库里有几个用户"来判断是否新安装 ──
 * 按用户数判定的话，把用户删光（或从备份里只恢复了一部分数据）会突然跳回引导页，
 * 而那时实例其实已经在用了。标记一旦写下就不回退：要重新走引导，删掉这一行即可。
 */
@Entity('InstanceState')
export class InstanceState {
  @PrimaryGeneratedColumn()
  id: number;

  /** 引导完成时间；为空 = 尚未完成（此时除白名单外的业务接口一律 503 setup.required） */
  @Column({ type: 'datetime', precision: 3, nullable: true })
  setupCompletedAt: Date | null;
}
