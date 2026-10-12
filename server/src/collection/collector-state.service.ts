import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataCollectionState } from '../entities/data-collection-state.entity';

/**
 * 收集器实例注册状态的读写（`DataCollectionState` 单例行）。
 *
 * 单独一个 service 是为了把"明文凭据"的读写收在一处：只有这个文件会碰
 * `instanceKey` 那一列，其它模块想上报只能通过 `key()` 拿到字符串，
 * 不可能顺手把它序列化进某个响应里。
 */
@Injectable()
export class CollectorStateService {
  constructor(
    @InjectRepository(DataCollectionState)
    private readonly states: Repository<DataCollectionState>,
  ) {}

  /**
   * 当前注册状态；没注册过返回 null。
   *
   * 用 `find({ take: 1 })` 而不是 `findOne({ order })`：TypeORM 的 findOne **必须带
   * 选择条件**，只给 order 会抛 "You must provide selection conditions in order to
   * find a single row" —— 而这张表是单例行，本来就没有条件可给。
   */
  async load(): Promise<DataCollectionState | null> {
    const rows = await this.states.find({ order: { id: 'ASC' }, take: 1 });
    return rows[0] ?? null;
  }

  /** 已注册的实例凭据；未注册为 null */
  async key(): Promise<string | null> {
    const row = await this.load();
    return row?.instanceKey ?? null;
  }

  /** 写入（或覆盖）注册结果 */
  async saveRegistration(input: {
    key: string;
    keyPrefix: string;
    instanceId: number | null;
    instanceName: string;
  }): Promise<DataCollectionState> {
    const row = (await this.load()) ?? this.states.create();
    row.instanceKey = input.key;
    row.instanceKeyPrefix = input.keyPrefix;
    row.instanceId = input.instanceId;
    row.instanceName = input.instanceName;
    row.registeredAt = new Date();
    return this.states.save(row);
  }

  /** 凭据失效时清掉，让下一轮重新注册 */
  async clearKey(): Promise<void> {
    const row = await this.load();
    if (!row) return;
    row.instanceKey = null;
    row.instanceKeyPrefix = null;
    row.instanceId = null;
    row.registeredAt = null;
    await this.states.save(row);
  }

  /** 一轮跑完（无论上报了多少）都记一下时间，并清掉上一次的错误 */
  async markSync(): Promise<void> {
    const row = (await this.load()) ?? this.states.create();
    row.lastSyncAt = new Date();
    row.lastErrorCode = null;
    row.lastErrorAt = null;
    await this.states.save(row);
  }

  /** 记一个机器可读的失败原因，供排障（也为将来的 /health 留口子） */
  async markError(code: string): Promise<void> {
    const row = (await this.load()) ?? this.states.create();
    row.lastErrorCode = code;
    row.lastErrorAt = new Date();
    await this.states.save(row);
  }
}
