import { postJson } from './http';
import type { NotifyChannel, NotifyConfig, NotifyMessage } from './notify-channel';

/** Bark（iOS 推送）渠道；serverUrl 可自建，末尾斜杠要去掉以免拼出双斜杠 */
export const barkChannel: NotifyChannel = {
  type: 'bark',
  send(config: NotifyConfig, message: NotifyMessage): Promise<void> {
    const base = (config.serverUrl || 'https://api.day.app').replace(/\/+$/, '');
    return postJson(`${base}/${config.serverKey}`, { title: message.title, body: message.body });
  },
};
