import type { NotifyChannel, NotifyConfig, NotifyMessage } from './notify-channel';

/**
 * Server 酱渠道。
 * 这是唯一一个不发 JSON 的 HTTP 渠道：接口要求 form-urlencoded，所以不能复用 postJson。
 */
export const serverChanChannel: NotifyChannel = {
  type: 'serverchan',
  async send(config: NotifyConfig, message: NotifyMessage): Promise<void> {
    const params = new URLSearchParams({ title: message.title, desp: message.body });
    const response = await fetch(`https://sctapi.ftqq.com/${config.sendKey}.send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  },
};
