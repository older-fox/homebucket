import { postJson } from './http';
import type { NotifyChannel, NotifyConfig, NotifyMessage } from './notify-channel';

/** Discord Webhook 渠道（Markdown 加粗标题） */
export const discordChannel: NotifyChannel = {
  type: 'discord',
  send(config: NotifyConfig, message: NotifyMessage): Promise<void> {
    return postJson(config.webhookUrl, { content: `**${message.title}**\n${message.body}` });
  },
};
