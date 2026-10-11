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

export const entities = [
  CatalogItem,
  Contribution,
  CollectorInstance,
  AdminUser,
  AdminSession,
];
