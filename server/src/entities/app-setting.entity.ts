import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { STRING_LENGTH } from './column-spec';

/**
 * 实例级配置：把原本只能写在 `.env` 里的项搬进数据库，让「设置 → 实例设置」能改。
 *
 * 一行一项，`envName` 就是**环境变量的名字**（如 `SERVER_PORT`）。
 *
 * ── 为什么用 env 名当主键，而不是另起一套 camelCase 别名 ──
 * 这个功能的本质就是「env 变量 ↔ 表单字段」一一对应。多一层别名就多一处可能对不上的
 * 映射；直接用 env 名，注册表 / 本表 / 接口字段 / 前端文案 key 四者同名，`settings.test.mjs`
 * 里那条"`.env.example` 的每个变量都必须在注册表里出现一次"才能退化成一次集合比较。
 *
 * 列名取 `envName` 而不是 `key`：`key` 在 MySQL 里是保留字，靠反引号才能用，
 * 迟早会在某条手写 SQL 上绊一下。
 *
 * ── 为什么不是每项一列 ──
 * 列式方案每加一个配置就要在 MySQL 与 SQLite 各写一份迁移，还容易把 `db:check-drift`
 * 弄红；键值表把"有哪些配置"收敛到 `settings.registry.ts` 一处代码里，加配置零迁移。
 *
 * ── ⚠️ 这里可能存明文凭据 ──
 * `JWT_SECRET` / `S3_SECRET_KEY` / `S3_ACCESS_KEY` / `DEFAULT_ADMIN_PASSWORD` 属于
 * 密钥类，明文入库（仓库里没有加密工具，跟随 `NotificationChannel.config`、
 * `DataCollectionState.instanceKey` 的既有取舍）。配套约束：
 *   1. 任何接口都不得回传密钥明文，只回「是否已设置」（见 settings.service.ts）；
 *   2. 日志不打这些值；
 *   3. 数据库 dump 视为凭据泄露。
 *
 * ── 留痕 ──
 * 只有 `updatedBy` / `updatedAt` 这一级最小留痕，**v1 不写 ActivityLog**：
 * `ActivityLog.familyId` 是 NOT NULL、`ActivityTargetType` 是封闭联合，而配置变更不属于
 * 任何家庭，硬塞进去要给它加一个"无家庭"的迁移。这里不假装有审计 —— 需要完整审计时
 * 再单独给配置变更开一条链路。
 */
@Entity('AppSetting')
export class AppSetting {
  /** 环境变量名，如 `SERVER_PORT`（与 settings.registry.ts 的 `envName` 字段逐字一致） */
  @PrimaryColumn({ type: 'varchar', length: STRING_LENGTH })
  envName: string;

  /**
   * 规范化后的字符串值（bool 存 'true'/'false'，数字存十进制串）。
   * `null` 与"这一行不存在"等价，都表示"没有覆盖，回落到 .env / 默认值"。
   */
  @Column({ type: 'text', nullable: true })
  value: string | null;

  /**
   * 最后修改人的 UserId。
   * 不建外键：给已存在的表加外键在 SQLite 上要整表重建，理由同 `User.avatarId`
   * （见 user.entity.ts 里那段注释）。
   */
  @Column({ type: 'int', nullable: true })
  updatedBy: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
