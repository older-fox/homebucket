import { postJson } from './http';
import type { NotifyChannel, NotifyConfig, NotifyMessage } from './notify-channel';

/** 企业微信群机器人渠道（markdown 消息，字段名是 content） */
export const wecomChannel: NotifyChannel = {
  type: 'wecom',
  send(config: NotifyConfig, message: NotifyMessage): Promise<void> {
    return postJson(config.webhookUrl, {
      msgtype: 'markdown',
      markdown: { content: `**${message.title}**\n${message.body}` },
    });
  },
};
