/**
 * 列长度集中定义：EntitySchema、迁移、校验都跟着这里走。
 *
 * 为什么不用 TypeORM 的默认长度 191：那是 MySQL utf8mb4 单列索引的遗留限制。
 * 收集器收的是各家实例填的公共资料，宁可把每一列的容量写清楚，
 * 也不要"默认值碰巧够用"。
 */
export const LENGTH = {
  /** 身份键：`barcode:<条码>` 或 `fingerprint:<sha256>` */
  identityKey: 160,
  barcode: 64,
  name: 200,
  description: 500,
  model: 120,
  manufacturer: 120,
  category: 80,
  baseUnit: 32,
  /** 锁定字段名单（JSON 数组） */
  lockedFieldsJson: 500,
  /** 原始上报 body（JSON），只做审计与重算，不做查询条件 */
  payloadJson: 6000,
  appliedFieldsJson: 500,
  /** ISO-8601 UTC 字符串，固定 24 字符 */
  isoTime: 32,
  keyPrefix: 24,
  keyHash: 64,
  instanceName: 120,
  platform: 80,
  instanceVersion: 32,
  source: 32,
  blockReason: 200,
  /** 管理员账号名 */
  adminUsername: 32,
  /** 口令哈希：`scrypt$N$r$p$<saltB64>$<hashB64>`，参数升级后还要放得下 */
  passwordHash: 240,
  /** 会话令牌的 sha256（十六进制 64 字符）：库里不存明文令牌 */
  sessionTokenHash: 64,
  /** 登录请求的 User-Agent（只用于"这是哪台设备登录的"） */
  userAgent: 200,
  /**
   * 来源键：上报方身份。`r:<sha256前32位>`（自报安装 ID）或 `f:<sha256前32位>`（IP+UA 指纹）。
   * 64 是为了给将来换算法（sha512 等）留余量，避免又要改列。
   */
  sourceKey: 64,
  /** 来源种类的短标记（reported / fingerprint / none），只用于展示与筛选 */
  sourceKind: 16,
  /** 来源展示名（`自报 3f9a2c1b` 或 `IP 1.2.x.x`） */
  sourceLabel: 80,
  /** IP 的哈希（不存 IP 原文）：用于发现"一个来源键后面藏着多个 IP" */
  sourceIpHash: 64,
  /** 观测证据：某实例某次上报里某个字段的值（归一化后的字符串形式） */
  observationValue: 500,
  /** 观测字段名：`name` 等标量，或 `attributes.<key>`；扩展属性键上限 40，留足余量 */
  observationField: 64,
  /** 证据指纹：同实例同物品同字段同值只落一行（幂等上报不会重复投票） */
  observationHash: 64,
  /** 反馈里的对照值（"下发的这个值准不准"里的那个值） */
  feedbackValue: 500,
  /** 反馈备注（用户在界面上写"这是老型号"之类的说明） */
  feedbackNote: 500,
  /** 照片内容哈希（sha256 十六进制）：同时是文件名与去重键 */
  photoHash: 64,
  /** 照片 MIME 类型（image/png 等） */
  photoMime: 64,
  /** 照片扩展名（png/jpg/webp/gif），不含点 */
  photoExt: 8,
  /** 外部地址（照片外链、对方系统返回的 URL） */
  externalUrl: 600,
  /** 同步记录里的远端标识（对方系统返回的 id 或落盘文件名） */
  remoteRef: 200,
  /** 错误信息（同步失败原因等） */
  errorMessage: 500,
} as const;
