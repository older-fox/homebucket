/**
 * 通知渠道的公共契约。
 *
 * 拆分前所有渠道挤在 notifiers.module.ts 的一个 `switch (type)` 里，
 * 现在每个渠道一个文件、实现同一个接口，由 channels/index.ts 统一注册。
 */

/**
 * 渠道配置。
 * 库里 config 列存的是 JSON 字符串，解析后各字段都是字符串（不是布尔/数字），
 * 所以这里保持 `Record<string, string>`，各渠道按原逻辑自行转换。
 */
export type NotifyConfig = Record<string, string>;

/** 通知正文：只有标题 + 正文，各渠道自己拼成平台格式 */
export interface NotifyMessage {
  title: string;
  body: string;
}

/** 一个渠道实现；type 必须与 NOTIFIER_TYPES 中的取值一致 */
export interface NotifyChannel {
  readonly type: string;
  send(config: NotifyConfig, message: NotifyMessage): Promise<void>;
}
