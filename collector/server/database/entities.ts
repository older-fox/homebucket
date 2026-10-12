import { EntitySchema } from 'typeorm';
import { LENGTH } from './column-spec';

/**
 * 实体定义用 `EntitySchema` 而不是装饰器类。
 *
 * ── 为什么 ──
 * Nitro 用 esbuild 打包服务端代码，而 esbuild **不支持 emitDecoratorMetadata**。
 * TypeORM 的 `@Column()` 依赖编译期发出的 `design:type` 元数据才能推断列类型，
 * 在 Nitro 里这套元数据根本不存在 → 装饰器实体会在启动时报"列类型未知"。
 * EntitySchema 是纯数据描述，不依赖任何编译期元数据，在 esbuild/rollup/vite
 * 任何打包器下行为一致；代价是列类型要写全（本来也该写全）。
 *
 * `name` 仍然保持 'CatalogItem' 等，所以 `dataSource.getRepository('CatalogItem')`
 * 与服务层代码不用改。
 *
 * 字段语义与设计理由见各列注释（与迁移前一致）。
 */

export interface CatalogItemRow {
  id: number;
  identityKey: string;
  barcode: string | null;
  name: string | null;
  description: string | null;
  model: string | null;
  manufacturer: string | null;
  category: string | null;
  baseUnit: string | null;
  imageUrls: string | null;
  attributes: string | null;
  fieldUpdatedAt: string | null;
  lockedFields: string | null;
  contributionCount: number;
  instanceCount: number;
  mergedIntoId: number | null;
  firstSeenAt: Date;
  updatedAt: Date;
}

/**
 * 目录里的一个「物品身份」—— 合并之后的当前最优资料。
 *
 * ── 为什么要有 identityKey，而不只用条码 ──
 * 上报里相当一部分物品没有厂家条码（自制件、散装、老物件、贴纸磨掉的）。如果只有
 * 条码能当身份，这些物品就只能各存各的、永远合不到一起。于是身份键分两种：
 *   · `barcode:<条码>`        —— 有条码时，条码就是最强信号
 *   · `fingerprint:<sha256>`  —— 没条码时，用「名称+型号+制造商」的指纹兜底
 * 两种写法进同一个唯一列，查询方只需要认 `identityKey` 一个概念。
 * 身份键**在首次建档时确定**，之后不再因为改名而改变（否则历史贡献会全部错位）。
 *
 * ── 为什么字段大多可空 ──
 * 资料是一条条报上来的，第一条往往只有名字。NULL 表示"还没人报过这个字段"，
 * 与空字符串（有人报了个空）不是一回事，所以统一用 NULL，写入前 trim + 丢空。
 *
 * ── 为什么用 ISO 字符串存观测时间，而不是 datetime 列 ──
 * 合并规则要比较"谁的观测更新"。ISO-8601 UTC 字符串的字典序就等于时间序，
 * 用 varchar 存完全绕开各驱动对 Date 的不同处理（时区、精度、返回类型）。
 * `firstSeenAt`/`updatedAt` 只用于展示，才交给框架维护。
 */
export const CatalogItem = new EntitySchema<CatalogItemRow>({
  name: 'CatalogItem',
  tableName: 'CatalogItem',
  columns: {
    id: { type: 'integer', primary: true, generated: true },
    /** 唯一身份键：`barcode:<条码>` 或 `fingerprint:<sha256>` */
    identityKey: { type: 'varchar', length: LENGTH.identityKey, unique: true },
    /** 厂家条码（EAN/UPC/Code128…）。无条码为 NULL —— 唯一索引允许多个 NULL */
    barcode: { type: 'varchar', length: LENGTH.barcode, nullable: true, unique: true },
    name: { type: 'varchar', length: LENGTH.name, nullable: true },
    description: { type: 'varchar', length: LENGTH.description, nullable: true },
    model: { type: 'varchar', length: LENGTH.model, nullable: true },
    manufacturer: { type: 'varchar', length: LENGTH.manufacturer, nullable: true },
    category: { type: 'varchar', length: LENGTH.category, nullable: true },
    /** 最小计量单位（瓶/包/片…）。收集器只存名字，换算规则属于各实例自己的包装配置 */
    baseUnit: { type: 'varchar', length: LENGTH.baseUnit, nullable: true },
    /** JSON 数组：图片 URL 是**累加**的（任何实例拍的照片都值得留着） */
    imageUrls: { type: 'text', nullable: true },
    /** JSON 对象：{ 键: 值 }，给"任何属性"留的扩展位（容量、颜色、适配型号…） */
    attributes: { type: 'text', nullable: true },
    /** JSON 对象：{ 字段名: ISO 时间 }，字段级合并要用的"最后写入时间" */
    fieldUpdatedAt: { type: 'text', nullable: true },
    /**
     * JSON 数组：被人工锁定、拒绝自动改写的字段名。
     * 纠错台里改过的字段默认会进这里 —— 人工判断的优先级高于任何后续上报
     * （否则下一个实例上报就能把人工修正冲掉，纠错台就白做了）。
     */
    lockedFields: { type: 'text', nullable: true },
    /** 收到过多少条有效上报（不含被屏蔽的） */
    contributionCount: { type: 'integer', default: 0 },
    /** 有多少个不同实例报过（按 instanceId 去重，人工修正不计） */
    instanceCount: { type: 'integer', default: 0 },
    /**
     * 合并去向：人工/自动判定"这两条其实是一个东西"时，被并掉的那条指向保留的那条。
     * 保留整行而不是删除，是为了让历史贡献、外部链接、条码槽位都继续有效：
     * 按被并条码查询会重定向到目标条目。
     */
    mergedIntoId: { type: 'integer', nullable: true },
    firstSeenAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
  indices: [
    { columns: ['name'] },
    { columns: ['manufacturer'] },
    { columns: ['mergedIntoId'] },
  ],
});

export interface ContributionRow {
  id: number;
  catalogItemId: number;
  instanceId: number | null;
  barcode: string | null;
  payload: string;
  appliedFields: string | null;
  contentHash: string;
  source: string;
  observedAt: string;
  blocked: boolean;
  blockedReason: string | null;
  blockedAt: string | null;
  createdAt: Date;
}

/**
 * 一次上报（append-only：除了"屏蔽"标记，内容永不修改）。
 *
 * ── 为什么原始 body 也要存 ──
 * 收集器的价值在于"多来源交叉验证"，而交叉验证的前提是能回看每个来源到底说了什么。
 * 合并后的 CatalogItem 只是当下最优解，不是事实全集。纠错台屏蔽一条错误上报后，
 * 物品资料是**从这张表重算**出来的（见 recomputeItem），所以这里必须留下足够重建的原始数据。
 *
 * `appliedFields` 记录这次上报实际改动了哪些字段：重复上报（内容一样）会是空数组，
 * 这比"看起来收到了很多数据"更能反映真实贡献。
 */
export const Contribution = new EntitySchema<ContributionRow>({
  name: 'Contribution',
  tableName: 'Contribution',
  columns: {
    id: { type: 'integer', primary: true, generated: true },
    catalogItemId: { type: 'integer' },
    /** 上报方（CollectorInstance.id）；人工纠错与匿名老客户端上报为 NULL */
    instanceId: { type: 'integer', nullable: true },
    /** 上报涉及的条码（冗余一份，便于按条码审计，即使条目后来被合并） */
    barcode: { type: 'varchar', length: LENGTH.barcode, nullable: true },
    /** 归一化后的上报内容（JSON），重算的唯一输入 */
    payload: { type: 'varchar', length: LENGTH.payloadJson },
    /** 这次实际写入的字段名（JSON 数组）；空数组＝只留痕没改动 */
    appliedFields: { type: 'varchar', length: LENGTH.appliedFieldsJson, nullable: true },
    /**
     * 内容指纹（归一化字段的稳定序列化再 sha256）。
     * 用来识别"同一个实例重复上报同一条资料"，也方便排查某个来源是不是在刷量。
     */
    contentHash: { type: 'varchar', length: LENGTH.keyHash },
    /** 来源：api（实例上报/匿名上报）/ admin（人工纠错） */
    source: { type: 'varchar', length: LENGTH.source, default: 'api' },
    /** 数据本身的观测时间（上报方可指定，用于离线实例乱序补报）；ISO-8601 UTC 字符串 */
    observedAt: { type: 'varchar', length: LENGTH.isoTime },
    /**
     * 屏蔽标记：被屏蔽的上报不参与合并重算，也不出现在公开的物品资料里，
     * 但仍留在审计日志里（"这条被谁、因为什么屏蔽了"本身就是要留档的事实）。
     */
    blocked: { type: 'boolean', default: false },
    blockedReason: { type: 'varchar', length: LENGTH.blockReason, nullable: true },
    blockedAt: { type: 'varchar', length: LENGTH.isoTime, nullable: true },
    createdAt: { type: 'datetime', createDate: true },
  },
  indices: [
    { columns: ['catalogItemId', 'observedAt'] },
    { columns: ['instanceId'] },
    { columns: ['contentHash'] },
    { columns: ['blocked'] },
    { columns: ['createdAt'] },
  ],
});

export interface CollectorInstanceRow {
  id: number;
  name: string;
  keyPrefix: string;
  keyHash: string;
  platform: string | null;
  version: string | null;
  lastSeenAt: string | null;
  contributionCount: number;
  blocked: boolean;
  blockedReason: string | null;
  blockedAt: string | null;
  createdAt: Date;
}

/**
 * 一个上报方：某台 HomeBucket 实例（或某个接入收集器协议的集成）。
 *
 * ── 为什么是"自我注册"，不是人工签发 ──
 * 需求是"上报是自动的，实例是所有人运行的所有实例"：任何人都能装一个 HomeBucket，
 * 它第一次联网时就该能上报，不该等管理员发凭据。所以实例调一次
 * `POST /api/v1/instances` 自己领一把 key，存在本地配置里，之后一直用它。
 * 这样做的代价是任何人都能注册，好处是**每条上报都能追溯到具体实例**，
 * 于是"来源审计 / 屏蔽某条脏数据 / 封禁刷量实例"才成立 —— 光靠 IP 做不到这些。
 *
 * ── 凭据存储 ──
 * 只存 sha256（与 HomeBucket 的 API key 同一套思路）：数据库泄露不等于凭据泄露。
 * 明文只在注册响应里出现一次，之后任何接口都拿不回来，列表只显示 keyPrefix。
 */
export const CollectorInstance = new EntitySchema<CollectorInstanceRow>({
  name: 'CollectorInstance',
  tableName: 'CollectorInstance',
  columns: {
    id: { type: 'integer', primary: true, generated: true },
    /** 实例自报的名字（默认取主机名），便于在纠错台里认出是谁 */
    name: { type: 'varchar', length: LENGTH.instanceName },
    /** 明文前缀（`hbc_` 之后的前 8 位） */
    keyPrefix: { type: 'varchar', length: LENGTH.keyPrefix },
    keyHash: { type: 'varchar', length: LENGTH.keyHash },
    /** 实例自报的平台信息（如 homebucket/1.2.0），仅用于诊断 */
    platform: { type: 'varchar', length: LENGTH.platform, nullable: true },
    /** 实例自报的版本号，同上 */
    version: { type: 'varchar', length: LENGTH.instanceVersion, nullable: true },
    /** 最近一次成功鉴权时间（ISO 字符串，理由见 CatalogItem） */
    lastSeenAt: { type: 'varchar', length: LENGTH.isoTime, nullable: true },
    /** 累计收到多少条上报（含后来被屏蔽的） */
    contributionCount: { type: 'integer', default: 0 },
    /** 封禁：非空即拒绝上报（老数据保留，纠错台仍能看到它的历史） */
    blocked: { type: 'boolean', default: false },
    blockedReason: { type: 'varchar', length: LENGTH.blockReason, nullable: true },
    blockedAt: { type: 'varchar', length: LENGTH.isoTime, nullable: true },
    createdAt: { type: 'datetime', createDate: true },
  },
  indices: [{ columns: ['blocked'] }, { columns: ['keyHash'], unique: true }],
});

export interface AdminUserRow {
  id: number;
  username: string;
  passwordHash: string;
  passwordChangedAt: string | null;
  lastLoginAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 管理员账号（纠错台的登录凭据）。
 *
 * ── 为什么账号在库里，而不是像旧版那样只放一个环境变量里的令牌 ──
 * 需求是"账号密码由 .env 提供，初始化时直接创建，之后可以改密码"。
 * 改密码意味着凭据必须能被**写**下来，环境变量做不到（进程改不了自己的 .env），
 * 所以第一次启动时按 .env 建号，之后口令牌就归数据库管：
 * `.env` 只在"库里还没有账号"时生效，改过密码之后重启不会把密码改回去。
 *
 * ── 口令怎么存 ──
 * 只存 scrypt 哈希（每个账号一份随机盐，见 utils/auth.ts 的 hashPassword）。
 * 与实例 key 的思路一致：库泄露 ≠ 凭据泄露。明文口令只在 .env 和登录请求里存在过。
 */
export const AdminUser = new EntitySchema<AdminUserRow>({
  name: 'AdminUser',
  tableName: 'AdminUser',
  columns: {
    id: { type: 'integer', primary: true, generated: true },
    username: { type: 'varchar', length: LENGTH.adminUsername, unique: true },
    /** `scrypt$N$r$p$<saltB64>$<hashB64>`：算法参数写进字符串，将来换参数老口令仍可校验 */
    passwordHash: { type: 'varchar', length: LENGTH.passwordHash },
    /** 最近一次改密码时间（ISO 字符串，理由见 CatalogItem） */
    passwordChangedAt: { type: 'varchar', length: LENGTH.isoTime, nullable: true },
    /** 最近一次成功登录时间 */
    lastLoginAt: { type: 'varchar', length: LENGTH.isoTime, nullable: true },
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
  // username 的唯一性用列上的 unique 表达（下面的迁移里是一条 UNIQUE 约束）：
  // 再补一条唯一索引就是同一件事写两遍，徒增表结构噪音。
  indices: [],
});

export interface AdminSessionRow {
  tokenHash: string;
  adminUserId: number;
  expiresAt: string;
  lastUsedAt: string | null;
  userAgent: string | null;
  createdAt: Date;
}

/**
 * 登录会话（服务端会话表 + httpOnly cookie）。
 *
 * ── 为什么用服务端会话，而不是签名过的自包含令牌 ──
 *  1. **能立刻吊销**：改密码、点退出登录都要"现在就不认这个会话"，签名令牌做不到；
 *  2. **浏览器里没有可被 JS 读到的凭据**：令牌放在 httpOnly cookie 里，
 *     前端一行代码都拿不到它，XSS 也偷不走（旧版的 localStorage 令牌是可以被读走的）；
 *  3. 单进程 + SQLite 本来就有一个共享的存储，多存一张表的成本可以忽略。
 *
 * tokenHash 直接做主键：它天然唯一，也省掉一个额外索引。
 * 库里同样只存 sha256 —— 有人读到这张表也伪造不出会话。
 */
export const AdminSession = new EntitySchema<AdminSessionRow>({
  name: 'AdminSession',
  tableName: 'AdminSession',
  columns: {
    tokenHash: { type: 'varchar', length: LENGTH.sessionTokenHash, primary: true },
    /** 属于哪个账号（改密码时按它吊销"除当前之外"的会话） */
    adminUserId: { type: 'integer' },
    /** 过期时间（ISO 字符串，字典序即时间序，比较不用解析） */
    expiresAt: { type: 'varchar', length: LENGTH.isoTime },
    /** 最近一次用它通过鉴权的时间（节流写入，见 AuthService.verify） */
    lastUsedAt: { type: 'varchar', length: LENGTH.isoTime, nullable: true },
    /** 登录时的 User-Agent，运维想知道"这条会话是哪台设备" */
    userAgent: { type: 'varchar', length: LENGTH.userAgent, nullable: true },
    createdAt: { type: 'datetime', createDate: true },
  },
  indices: [{ columns: ['adminUserId'] }, { columns: ['expiresAt'] }],
});

export interface ItemObservationRow {
  id: number;
  catalogItemId: number;
  /** 哪个实例说的；匿名上报（老协议）为 null —— 只用于展示，**不参与投票身份判定** */
  instanceId: number | null;
  /**
   * 来源键（投票身份）：`r:<hash>` 自报安装 ID / `f:<hash>` IP+UA 指纹 / null = 认不出来源。
   * 上报全是匿名的，投票必须按它去重，而不是按 instanceId。
   */
  sourceKey: string | null;
  sourceKind: string | null;
  sourceLabel: string | null;
  sourceIpHash: string | null;
  /**
   * 上报时的 User-Agent（原文，未哈希）。
   *
   * 为什么**存原文**而不是一起哈希掉：指纹是 `sha256(ip + ua)`，管理员看到
   * `f:9a1c…` 时没有任何办法判断"这是浏览器刷新还是某个脚本在灌数据"。
   * UA 本身不指向个人（它是客户端自报的软件标识），把它摆出来是"来源页"
   * 能回答"这到底是谁"的关键。IP 则相反，只留哈希（见 sourceIpHash）。
   */
  userAgent: string | null;
  /** 字段名：标量字段名，或 `attributes.<key>` */
  field: string;
  /** 该字段在这条证据里的值（多值字段用 `\n` 连接的字符串，见 observations.service） */
  value: string;
  /** 物品+来源+字段+值的 sha256：幂等键，防同一来源自己刷票 */
  observationHash: string;
  /** 这个值首次被该来源报出来的时间（ISO，字典序即时间序） */
  observedAt: string;
  /** 由哪次上报带来（屏蔽该上报时连带失效） */
  contributionId: number | null;
  /** 上报当时的权重快照：只用于展示"这条证据有多重"，计算时仍取实时权重 */
  weight: number;
  createdAt: Date;
}

/**
 * 一条"观测证据"—— 某个来源某一次上报里、某一个字段的值。
 *
 * ── 为什么不能只留 Contribution ──
 * Contribution 是"一次上报的整包 payload"，适合审计与重放；但下发投票要回答的是
 * **逐字段**问题："name 这个字段，各来源分别说是什么、各有多少支持票"。
 * 从 JSON payload 现算当然也能算出来，但每次下发都要解析全部历史 payload，
 * 而且没法给"某字段的某个值"建索引。所以上报时就把证据拆成行：
 *   · 一个字段一行（`field` = `name` / `model` / … / `attributes.<key>`）
 *   · 值为空的行**不落库**（"没提这个字段"不构成证据，也不该参与投票）
 *   · `observationHash` 上有唯一约束 → 同一来源反复报同一个值只留一行，
 *     不会靠重复上报把自己的票刷上去
 *
 * ── 为什么身份是 sourceKey 而不是 instanceId ──
 * 收集器收到的上报**全是匿名的**（老协议连身份字段都没有），`instanceId` 因此恒为 null。
 * 若按它去重，等于所有上报都是"同一个来源"，投票层会彻底空转（实测确实如此）。
 * 所以投票身份改由 `sourceKey` 承担（自报 ID → IP+UA 指纹，见 utils/source.ts）；
 * `instanceId` 退化成"这条证据恰好来自哪个已注册实例"的展示信息。
 *
 * 观测行由上报流程顺带写入，`contributionId` 指回那次上报，
 * 方便"屏蔽一条上报"时连带让它的证据失效（见 observations.service）。
 */
export const ItemObservation = new EntitySchema<ItemObservationRow>({
  name: 'ItemObservation',
  tableName: 'ItemObservation',
  columns: {
    id: { type: 'integer', primary: true, generated: true },
    catalogItemId: { type: 'integer' },
    instanceId: { type: 'integer', nullable: true },
    sourceKey: { type: 'varchar', length: LENGTH.sourceKey, nullable: true },
    sourceKind: { type: 'varchar', length: LENGTH.sourceKind, nullable: true },
    sourceLabel: { type: 'varchar', length: LENGTH.sourceLabel, nullable: true },
    sourceIpHash: { type: 'varchar', length: LENGTH.sourceIpHash, nullable: true },
    userAgent: { type: 'varchar', length: LENGTH.userAgent, nullable: true },
    field: { type: 'varchar', length: LENGTH.observationField },
    value: { type: 'varchar', length: LENGTH.observationValue },
    observationHash: { type: 'varchar', length: LENGTH.observationHash },
    observedAt: { type: 'varchar', length: LENGTH.isoTime },
    contributionId: { type: 'integer', nullable: true },
    weight: { type: 'real', default: 1 },
    createdAt: { type: 'datetime', createDate: true },
  },
  indices: [
    { columns: ['observationHash'], unique: true },
    // 下发时的主要查询路径：某物品某字段的全部证据
    { columns: ['catalogItemId', 'field'] },
    { columns: ['instanceId'] },
    { columns: ['contributionId'] },
    // 投票时要按来源聚合（同一来源同字段同值只算一票）
    { columns: ['sourceKey'] },
  ],
});

export interface ObservationFeedbackRow {
  id: number;
  catalogItemId: number;
  /** 被评价的那条证据（可空：反馈针对"当时下发的值"，那条观测可能已被屏蔽） */
  observationId: number | null;
  /** 被评价的值来自哪个已注册实例（可空，只用于展示） */
  instanceId: number | null;
  /** 被评价的值来自哪个来源（**加权就记在它头上**，见 source.ts） */
  sourceKey: string | null;
  /** 被评价的字段与值（用户在界面上看到的就是这一对） */
  field: string;
  value: string | null;
  /** true = 用户说"准确"，false = 用户说"不准确" */
  accurate: boolean;
  /** 反馈来自哪个已注册实例（匿名反馈为 null，只用于展示） */
  reporterInstanceId: number | null;
  /** 备注：用户解释"哪里不准"（可空） */
  note: string | null;
  /** 反馈方自己的来源键：同一来源对同一物品同一字段只算一次（防重复点） */
  reporterKey: string | null;
  createdAt: Date;
}

/**
 * 用户反馈：下发的这条资料准不准。
 *
 * ── 为什么反馈要落库，而不是顺手把权重改了 ──
 * 权重是**推导值**：能按"全部反馈重算一遍"得到，也就能解释"这个实例为什么是 0.83"。
 * 只存权重数字的话，算法一调整、或者有人误点，就再也说不清它怎么来的。
 * 所以反馈是事实、权重是派生视图（InstanceWeight），后者可从前者重建。
 */
export const ObservationFeedback = new EntitySchema<ObservationFeedbackRow>({
  name: 'ObservationFeedback',
  tableName: 'ObservationFeedback',
  columns: {
    id: { type: 'integer', primary: true, generated: true },
    catalogItemId: { type: 'integer' },
    observationId: { type: 'integer', nullable: true },
    instanceId: { type: 'integer', nullable: true },
    sourceKey: { type: 'varchar', length: LENGTH.sourceKey, nullable: true },
    field: { type: 'varchar', length: LENGTH.observationField },
    value: { type: 'varchar', length: LENGTH.feedbackValue, nullable: true },
    accurate: { type: 'boolean' },
    reporterInstanceId: { type: 'integer', nullable: true },
    note: { type: 'varchar', length: LENGTH.feedbackNote, nullable: true },
    reporterKey: { type: 'varchar', length: LENGTH.sourceKey, nullable: true },
    createdAt: { type: 'datetime', createDate: true },
  },
  indices: [
    { columns: ['catalogItemId'] },
    { columns: ['instanceId'] },
    // 加权与去重都按来源：同一来源对同一物品同一字段只算一次反馈
    { columns: ['sourceKey'] },
    { columns: ['sourceKey', 'catalogItemId', 'field'] },
    { columns: ['reporterKey'] },
  ],
});

export interface SourceWeightRow {
  /** 来源键（见 source.ts）：`r:<hash>` 或 `f:<hash>` */
  sourceKey: string;
  /** 当前权重（夹在 [min, max] 之间）：投票与加权随机都用它 */
  weight: number;
  /** 收到的"准确"次数 */
  upvotes: number;
  /** 收到的"不准确"次数 */
  downvotes: number;
  lastFeedbackAt: string | null;
  updatedAt: Date;
}

/**
 * 来源权重（派生视图，主键是 sourceKey）。
 *
 * ── 为什么按来源而不是按实例 ──
 * 要加权就必须能把反馈稳定地记到"谁"头上。已注册实例的 key 在真实流量里根本不存在
 * （上报全匿名），所以只能记在来源键上。分成独立一张表还有一个好处：
 * 重建权重（`POST /api/admin/weights/recompute`）只动这一张，不碰鉴权相关的列。
 *
 * 名字从 InstanceWeight 改过来是因为语义真的变了 —— 它现在是"某个上报方"的权重，
 * 与 CollectorInstance 表没有外键关系（匿名来源压根没有实例行）。
 */
export const SourceWeight = new EntitySchema<SourceWeightRow>({
  name: 'SourceWeight',
  tableName: 'SourceWeight',
  columns: {
    sourceKey: { type: 'varchar', length: LENGTH.sourceKey, primary: true },
    weight: { type: 'real', default: 1 },
    upvotes: { type: 'integer', default: 0 },
    downvotes: { type: 'integer', default: 0 },
    lastFeedbackAt: { type: 'varchar', length: LENGTH.isoTime, nullable: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
  indices: [{ columns: ['weight'] }],
});

export interface PhotoAssetRow {
  /** 内容哈希（sha256 十六进制）：同一张图重复上传只落一份 */
  hash: string;
  /** 哪个驱动写的（local/s3）：换驱动后老图仍知道去哪儿取 */
  driver: string;
  /** 驱动内部的定位键：local 是相对路径，s3 是对象键 */
  storageKey: string;
  mime: string;
  ext: string;
  bytes: number;
  width: number | null;
  height: number | null;
  /** 谁上传的（实例 id；匿名上传为 null） */
  instanceId: number | null;
  createdAt: Date;
}

/**
 * 照片资产（内容寻址）。
 *
 * ── 为什么按内容哈希存，而不是按物品/上报 id 建目录 ──
 *  · **去重**：同一张图被多个实例上报、或同一物品上重复上报，只占一份空间；
 *  · **URL 稳定**：`/api/photos/<hash>.<ext>` 永远指向同一份字节，可以被上游长期引用；
 *  · **换存储后端不用改 URL**：驱动换了、hash 不变，对外地址也不变。
 */
export const PhotoAsset = new EntitySchema<PhotoAssetRow>({
  name: 'PhotoAsset',
  tableName: 'PhotoAsset',
  columns: {
    hash: { type: 'varchar', length: LENGTH.photoHash, primary: true },
    driver: { type: 'varchar', length: LENGTH.source },
    storageKey: { type: 'varchar', length: LENGTH.externalUrl },
    mime: { type: 'varchar', length: LENGTH.photoMime },
    ext: { type: 'varchar', length: LENGTH.photoExt },
    bytes: { type: 'integer' },
    width: { type: 'integer', nullable: true },
    height: { type: 'integer', nullable: true },
    instanceId: { type: 'integer', nullable: true },
    createdAt: { type: 'datetime', createDate: true },
  },
  indices: [{ columns: ['instanceId'] }, { columns: ['createdAt'] }],
});

export interface OutboundSyncRow {
  id: number;
  /** 同步的对象（目录条目 id） */
  catalogItemId: number;
  /** 条码（冗余一份：条目被合并/删除后仍能看出这条同步的是谁） */
  barcode: string | null;
  /** 传输方式（http/file）：同一批记录里可能混着两种 */
  transport: string;
  /** pending | ok | failed */
  status: string;
  attempts: number;
  lastAttemptAt: string | null;
  syncedAt: string | null;
  lastError: string | null;
  /** 远端标识：对方返回的 id、或落盘文件名 */
  remoteRef: string | null;
  /** 这次同步用的载荷指纹：载荷没变就不必重复发送 */
  payloadHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 出站同步记录（"上级数据库"适配层的状态）。
 *
 * 语义是**每个条目一行**（catalogItemId 唯一）：这一行回答"这个有条码的物品，
 * 最后一次往上级送的结果是什么"。不做成"每次尝试一行"的流水，是因为页面上真正要看的
 * 是"还有哪些没送成功"；尝试次数与最后错误已经够定位问题。
 */
export const OutboundSync = new EntitySchema<OutboundSyncRow>({
  name: 'OutboundSync',
  tableName: 'OutboundSync',
  columns: {
    id: { type: 'integer', primary: true, generated: true },
    catalogItemId: { type: 'integer' },
    barcode: { type: 'varchar', length: LENGTH.barcode, nullable: true },
    transport: { type: 'varchar', length: LENGTH.source },
    status: { type: 'varchar', length: LENGTH.source, default: 'pending' },
    attempts: { type: 'integer', default: 0 },
    lastAttemptAt: { type: 'varchar', length: LENGTH.isoTime, nullable: true },
    syncedAt: { type: 'varchar', length: LENGTH.isoTime, nullable: true },
    lastError: { type: 'varchar', length: LENGTH.errorMessage, nullable: true },
    remoteRef: { type: 'varchar', length: LENGTH.remoteRef, nullable: true },
    payloadHash: { type: 'varchar', length: LENGTH.observationHash, nullable: true },
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
  indices: [
    { columns: ['catalogItemId'], unique: true },
    { columns: ['status'] },
    { columns: ['syncedAt'] },
  ],
});

export const entities = [
  CatalogItem,
  Contribution,
  CollectorInstance,
  AdminUser,
  AdminSession,
  ItemObservation,
  ObservationFeedback,
  SourceWeight,
  PhotoAsset,
  OutboundSync,
];
