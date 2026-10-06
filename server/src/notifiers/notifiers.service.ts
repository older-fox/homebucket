import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { NotificationChannel } from '../entities/notification-channel.entity';
import { notifierChannels, type NotifyChannel, type NotifyConfig, type NotifyMessage } from './channels';
import type { CreateNotifierDto, UpdateNotifierDto } from './dto';

/** 通知器可订阅的事件名；空订阅表示全部事件 */
export const NOTIFIER_EVENTS = [
  'invite_created',
  'member_joined',
  'item_created',
  'item_updated',
  'location_created',
] as const;

/**
 * 通知器的增删改查与事件派发。
 * 发送实现全部搬到了 channels/ 目录，这里只负责"选渠道 + 组装 config + 错误包装"。
 */
@Injectable()
export class NotifiersService {
  private readonly logger = new Logger(NotifiersService.name);

  constructor(
    @InjectRepository(NotificationChannel)
    private readonly channels: Repository<NotificationChannel>,
  ) {}

  async list(familyId: number) {
    const rows = await this.channels.find({
      where: { familyId },
      order: { id: 'ASC' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async create(familyId: number, dto: CreateNotifierDto) {
    this.assertType(dto.type);
    const row = await this.channels.save(
      this.channels.create({
        familyId,
        type: dto.type,
        name: dto.name,
        enabled: dto.enabled ?? true,
        events: (dto.events ?? []).join(','),
        config: JSON.stringify(dto.config ?? {}),
      }),
    );
    return this.toDto(row);
  }

  async update(familyId: number, id: number, dto: UpdateNotifierDto) {
    const row = await this.mustLoad(familyId, id);

    // 只覆盖 dto 里出现过的字段（Prisma 的 undefined = 不改，这里保持一致）
    if (dto.name !== undefined) row.name = dto.name;
    if (dto.enabled !== undefined) row.enabled = dto.enabled;
    // events / config 沿用原来的真值判断：空数组、空对象也是真值，等价于"传了就更新"
    if (dto.events) row.events = dto.events.join(',');
    if (dto.config) row.config = JSON.stringify(dto.config);
    // updatedAt 由 @UpdateDateColumn 自动维护

    return this.toDto(await this.channels.save(row));
  }

  async remove(familyId: number, id: number) {
    const row = await this.mustLoad(familyId, id);
    await this.channels.delete({ id: row.id });
    return { ok: true };
  }

  async test(familyId: number, id: number) {
    const row = await this.mustLoad(familyId, id);

    try {
      // 先解析 config、再取渠道：保持与拆分前 `send(row.type, JSON.parse(...), ...)` 相同的求值顺序，
      // 这样"未知类型"仍然会被下面的 catch 包成 notifier.sendFailed（与改造前一致）
      const config = JSON.parse(row.config) as NotifyConfig;
      const channel = this.mustChannel(row.type);
      await channel.send(config, {
        title: 'Homebucket',
        body: 'test message',
      });
    } catch (error) {
      throw new BadRequestException({
        code: 'notifier.sendFailed',
        message: `发送失败：${(error as Error).message}`,
      });
    }
    return { ok: true };
  }

  /** 事件派发：被邀请、新增物品等场景调用，失败只记日志不影响主流程 */
  async dispatch(familyId: number, event: string, message: NotifyMessage) {
    const rows = await this.channels.find({ where: { familyId, enabled: true } });

    await Promise.all(
      rows
        .filter((row) => {
          const events = row.events.split(',').map((item) => item.trim()).filter(Boolean);
          return events.length === 0 || events.includes(event);
        })
        .map(async (row) => {
          try {
            // 与 test() 同理：解析与选渠道都放在 try 内，未知类型只记一条告警
            const config = JSON.parse(row.config) as NotifyConfig;
            await this.mustChannel(row.type).send(config, message);
          } catch (error) {
            this.logger.warn(`通知器 ${row.name}（${row.type}）发送失败：${(error as Error).message}`);
          }
        }),
    );
  }

  private assertType(type: string) {
    this.mustChannel(type);
  }

  /**
   * 按 type 从注册表取渠道；未知类型抛与拆分前完全相同的异常。
   * 调用方（test / dispatch）需要把它放在 try 内，保证异常包装行为不变。
   */
  private mustChannel(type: string): NotifyChannel {
    const channel = notifierChannels.get(type);
    if (!channel) {
      throw new BadRequestException({ code: 'notifier.typeUnknown', message: `不支持的通知器类型：${type}` });
    }
    return channel;
  }

  /**
   * 取本家庭的通知器，不存在抛 notifier.notFound。
   * 拆分前 update/remove 用 `select: { id: true }` 判存在，这里用 findOne 拿到整行，
   * 既满足存在性判断，update 也能直接改字段（少一次查询）。
   */
  private async mustLoad(familyId: number, id: number): Promise<NotificationChannel> {
    const row = await this.channels.findOne({ where: { id, familyId } });
    if (!row) throw new NotFoundException({ code: 'notifier.notFound', message: '通知器不存在' });
    return row;
  }

  // 显式映射返回值：TypeORM 的 relations/整行加载会多带字段，接口结构必须与改造前一致
  private toDto(row: NotificationChannel) {
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      enabled: row.enabled,
      events: row.events.split(',').map((item) => item.trim()).filter(Boolean),
      config: JSON.parse(row.config || '{}') as NotifyConfig,
      createdAt: row.createdAt,
    };
  }
}
