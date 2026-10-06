import nodemailer from 'nodemailer';
import type { NotifyChannel, NotifyConfig, NotifyMessage } from './notify-channel';

/**
 * SMTP 邮件渠道。
 * 邮件不是 HTTP，走 nodemailer；端口默认 587，secure 只有配置成字符串 'true' 才开启。
 */
export const smtpChannel: NotifyChannel = {
  type: 'smtp',
  async send(config: NotifyConfig, message: NotifyMessage): Promise<void> {
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
  },
};
