import { postJson } from './http';
import type { NotifyChannel, NotifyConfig, NotifyMessage } from './notify-channel';

/** Google Chat Webhook 渠道（单星号加粗） */
export const googleChatChannel: NotifyChannel = {
  type: 'googlechat',
  send(config: NotifyConfig, message: NotifyMessage): Promise<void> {
    return postJson(config.webhookUrl, { text: `*${message.title}*\n${message.body}` });
  },
};
