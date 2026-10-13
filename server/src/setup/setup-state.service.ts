import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InstanceState } from '../entities/instance-state.entity';

/**
 * "本实例是否已完成初始化引导"的内存态。
 *
 * 启动时从 `InstanceState` 读一次进内存，之后由 `finish` 更新 —— 门禁守卫每个请求都要看它，
 * 不能每请求查库。这也意味着状态只在单进程内一致：多副本部署时另一个副本要等重启才会知道，
 * 但那之前引导根本没完成（连管理员都还没有），多副本本来也没意义。
 */
@Injectable()
export class SetupStateService implements OnModuleInit {
  private completed = false;

  constructor(@InjectRepository(InstanceState) private readonly states: Repository<InstanceState>) {}

  async onModuleInit(): Promise<void> {
    // 单行表：find({take:1}) 而不是 findOne({}) —— 后者在 TypeORM 1.x 里不带 where 会抛错
    const [row] = await this.states.find({ take: 1 });
    this.completed = Boolean(row?.setupCompletedAt);
  }

  get isCompleted(): boolean {
    return this.completed;
  }

  /** 标记引导完成（写库 + 更新内存态）。已完成为幂等操作。 */
  async markCompleted(): Promise<void> {
    if (this.completed) return;

    const [row] = await this.states.find({ take: 1 });
    if (row) {
      row.setupCompletedAt = new Date();
      await this.states.save(row);
    } else {
      await this.states.save(this.states.create({ setupCompletedAt: new Date() }));
    }

    this.completed = true;
  }
}
