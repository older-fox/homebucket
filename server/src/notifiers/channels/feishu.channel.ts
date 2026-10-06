import { postJson } from './http';
import type { NotifyChannel, NotifyConfig, NotifyMessage } from './notify-channel';

/** 飞书自定义机器人渠道（text 消息） */
export const feishuChannel: NotifyChannel = {
  type: 'feishu',
  send(config: NotifyConfig, message: NotifyMessage): Promise<void> {
    return postJson(config.webhookUrl, {
      msg_type: 'text',
      content: { text: `${message.title}\n${message.body}` },
    });
  },
};
