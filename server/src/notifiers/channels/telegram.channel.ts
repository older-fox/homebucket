import { postJson } from './http';
import type { NotifyChannel, NotifyConfig, NotifyMessage } from './notify-channel';

/** Telegram Bot 渠道（sendMessage 接口，标题与正文用换行拼接） */
export const telegramChannel: NotifyChannel = {
  type: 'telegram',
  send(config: NotifyConfig, message: NotifyMessage): Promise<void> {
    return postJson(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      chat_id: config.chatId,
      text: `${message.title}\n${message.body}`,
    });
  },
};
