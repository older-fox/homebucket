import { barkChannel } from './bark.channel';
import { dingtalkChannel } from './dingtalk.channel';
import { discordChannel } from './discord.channel';
import { feishuChannel } from './feishu.channel';
import { googleChatChannel } from './googlechat.channel';
import { serverChanChannel } from './serverchan.channel';
import { smtpChannel } from './smtp.channel';
import { telegramChannel } from './telegram.channel';
import { wecomChannel } from './wecom.channel';
import type { NotifyChannel } from './notify-channel';

export type { NotifyChannel, NotifyConfig, NotifyMessage } from './notify-channel';

/** 支持的通知器类型（顺序与拆分前一致，对外可见） */
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

/**
 * 渠道注册表 —— 原 `switch (type)` 的替代品：一个类型对应一个实现文件。
 *
 * 这里用 `Record<NotifierType, NotifyChannel>` 而不是松散的数组：
 * TS 会强制 9 个类型全部登记（漏写一个直接编译失败，也就不会退化成运行期才发现的 bug），
 * 下面的 Map 只是给业务侧做 O(1) 的按 type 查找。
 */
const CHANNELS: Record<NotifierType, NotifyChannel> = {
  smtp: smtpChannel,
  googlechat: googleChatChannel,
  telegram: telegramChannel,
  discord: discordChannel,
  dingtalk: dingtalkChannel,
  feishu: feishuChannel,
  wecom: wecomChannel,
  bark: barkChannel,
  serverchan: serverChanChannel,
};

/** type -> 渠道实现；未知 type 由调用方（NotifiersService）抛 notifier.typeUnknown */
export const notifierChannels: Map<string, NotifyChannel> = new Map(Object.entries(CHANNELS));
