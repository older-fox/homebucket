import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsObject, IsOptional, IsString, Length } from 'class-validator';
import nodemailer from 'nodemailer';
import { CurrentFamily, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import { PrismaService } from '../prisma/prisma.service';

export const NOTIFIER_TYPES = [
  'smtp',
  'googlechat',
  'telegram',
  'discord',
  'dingtalk',
  'feishu',
  'wecom',
  'bark',
  'serverchan',
] as const;

export type NotifierType = (typeof NOTIFIER_TYPES)[number];

export const NOTIFIER_EVENTS = [
  'invite_created',
  'member_joined',
  'item_created',
  'item_updated',
  'location_created',
] as const;

export interface NotifyMessage {
  title: string;
  body: string;
}

type Config = Record<string, string>;

export class CreateNotifierDto {
  @IsString()
  type: string;

  @IsString()
  @Length(1, 60)
  name: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @IsObject()
  config: Config;
}

export class UpdateNotifierDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @IsOptional()
  @IsObject()
  config?: Config;
}

/** 各通知器的发送实现：统一 fetch/邮件，失败抛出带上下文的错误 */
async function send(type: string, config: Config, message: NotifyMessage): Promise<void> {
  const post = async (url: string, body: unknown, headers?: Record<string, string>) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  };

  switch (type) {
    case 'smtp': {
      const transport = nodemailer.createTransport({
        host: config.host,
        port: Number(config.port ?? 587),
        secure: config.secure === 'true',
        auth: config.user ? { user: config.user, pass: config.pass } : undefined,
      });
      await transport.sendMail({
        from: config.from || config.user,
        to: (config.to ?? '').split(',').map((item) => item.trim()).filter(Boolean),
        subject: message.title,
        text: message.body,
      });
      return;
    }
    case 'telegram': {
      await post(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        chat_id: config.chatId,
        text: `${message.title}\n${message.body}`,
      });
      return;
    }
    case 'discord':
      await post(config.webhookUrl, { content: `**${message.title}**\n${message.body}` });
      return;
    case 'googlechat':
      await post(config.webhookUrl, { text: `*${message.title}*\n${message.body}` });
      return;
    case 'dingtalk':
      await post(config.webhookUrl, {
        msgtype: 'markdown',
        markdown: { title: message.title, text: `**${message.title}**\n\n${message.body}` },
      });
      return;
    case 'feishu':
      await post(config.webhookUrl, {
        msg_type: 'text',
        content: { text: `${message.title}\n${message.body}` },
      });
      return;
    case 'wecom':
      await post(config.webhookUrl, {
        msgtype: 'markdown',
        markdown: { content: `**${message.title}**\n${message.body}` },
      });
      return;
    case 'bark': {
      const base = (config.serverUrl || 'https://api.day.app').replace(/\/+$/, '');
      await post(`${base}/${config.serverKey}`, { title: message.title, body: message.body });
      return;
    }
    case 'serverchan': {
      const params = new URLSearchParams({ title: message.title, desp: message.body });
      const response = await fetch(`https://sctapi.ftqq.com/${config.sendKey}.send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return;
    }
    default:
      throw new BadRequestException({ code: 'notifier.typeUnknown', message: `不支持的通知器类型：${type}` });
  }
}

@Injectable()
export class NotifiersService {
  private readonly logger = new Logger(NotifiersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(familyId: number) {
    const rows = await this.prisma.notificationChannel.findMany({
      where: { familyId },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async create(familyId: number, dto: CreateNotifierDto) {
    this.assertType(dto.type);
    const row = await this.prisma.notificationChannel.create({
      data: {
        familyId,
        type: dto.type,
        name: dto.name,
        enabled: dto.enabled ?? true,
        events: (dto.events ?? []).join(','),
        config: JSON.stringify(dto.config ?? {}),
      },
    });
    return this.toDto(row);
  }

  async update(familyId: number, id: number, dto: UpdateNotifierDto) {
    await this.mustExist(familyId, id);
    const row = await this.prisma.notificationChannel.update({
      where: { id },
      data: {
        name: dto.name,
        enabled: dto.enabled,
        events: dto.events ? dto.events.join(',') : undefined,
        config: dto.config ? JSON.stringify(dto.config) : undefined,
      },
    });
    return this.toDto(row);
  }

  async remove(familyId: number, id: number) {
    await this.mustExist(familyId, id);
    await this.prisma.notificationChannel.delete({ where: { id } });
    return { ok: true };
  }

  async test(familyId: number, id: number) {
    const row = await this.prisma.notificationChannel.findFirst({ where: { id, familyId } });
    if (!row) throw new NotFoundException({ code: 'notifier.notFound', message: '通知器不存在' });

    try {
      await send(row.type, JSON.parse(row.config) as Config, {
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
    const channels = await this.prisma.notificationChannel.findMany({
      where: { familyId, enabled: true },
    });

    await Promise.all(
      channels
        .filter((channel) => {
          const events = channel.events.split(',').map((item) => item.trim()).filter(Boolean);
          return events.length === 0 || events.includes(event);
        })
        .map(async (channel) => {
          try {
            await send(channel.type, JSON.parse(channel.config) as Config, message);
          } catch (error) {
            this.logger.warn(`通知器 ${channel.name}（${channel.type}）发送失败：${(error as Error).message}`);
          }
        }),
    );
  }

  private assertType(type: string) {
    if (!NOTIFIER_TYPES.includes(type as NotifierType)) {
      throw new BadRequestException({ code: 'notifier.typeUnknown', message: `不支持的通知器类型：${type}` });
    }
  }

  private async mustExist(familyId: number, id: number) {
    const row = await this.prisma.notificationChannel.findFirst({
      where: { id, familyId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException({ code: 'notifier.notFound', message: '通知器不存在' });
  }

  private toDto(row: {
    id: number;
    type: string;
    name: string;
    enabled: boolean;
    events: string;
    config: string;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      enabled: row.enabled,
      events: row.events.split(',').map((item) => item.trim()).filter(Boolean),
      config: JSON.parse(row.config || '{}') as Config,
      createdAt: row.createdAt,
    };
  }
}

@Controller('notifiers')
export class NotifiersController {
  constructor(private readonly notifiers: NotifiersService) {}

  @FamilyScoped()
  @Get()
  list(@CurrentFamily() family: FamilyContext) {
    return this.notifiers.list(family.id);
  }

  @FamilyScoped()
  @Post()
  create(@CurrentFamily() family: FamilyContext, @Body() dto: CreateNotifierDto) {
    return this.notifiers.create(family.id, dto);
  }

  @FamilyScoped()
  @Patch(':id')
  update(
    @CurrentFamily() family: FamilyContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNotifierDto,
  ) {
    return this.notifiers.update(family.id, id, dto);
  }

  @FamilyScoped()
  @Delete(':id')
  remove(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.notifiers.remove(family.id, id);
  }

  @FamilyScoped()
  @Post(':id/test')
  test(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.notifiers.test(family.id, id);
  }
}

@Module({
  controllers: [NotifiersController],
  providers: [NotifiersService],
  exports: [NotifiersService],
})
export class NotifiersModule {}
