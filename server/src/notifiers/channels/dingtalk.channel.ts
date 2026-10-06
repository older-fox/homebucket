import { postJson } from './http';
import type { NotifyChannel, NotifyConfig, NotifyMessage } from './notify-channel';

/** 钉钉群机器人渠道（markdown 消息，正文前空一行） */
export const dingtalkChannel: NotifyChannel = {
  type: 'dingtalk',
  send(config: NotifyConfig, message: NotifyMessage): Promise<void> {
    return postJson(config.webhookUrl, {
      msgtype: 'markdown',
      markdown: { title: message.title, text: `**${message.title}**\n\n${message.body}` },
    });
  },
};
