import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from '../entities/app-setting.entity';
import { hasOverride, isLockedEnv, isPendingRestart, isValidSizeLiteral, raw } from '../config/env';
import { CollectionSyncService } from '../collection/collection-sync.service';
import { applySettingRows } from './settings.bootstrap';
import {
  SETTINGS,
  SETTING_GROUPS,
  settingByEnv,
  type SettingDef,
  type SettingGroup,
  type SettingType,
} from './settings.registry';

/** 这一项当前的值是从哪来的（界面据此显示小标签） */
export type SettingSource = 'db' | 'env' | 'default';

export interface SettingItemView {
  envName: string;
  group: SettingGroup;
  type: SettingType;
  source: SettingSource;
  hasOverride: boolean;
  restartRequired: boolean;
  /** 已保存但本进程还没用上（只对 restartRequired 的项可能为 true） */
  pendingRestart: boolean;
  warning?: string;
  enumValues?: string[];
  min?: number;
  max?: number;
  maxLength?: number;
  allowEmpty?: boolean;
  /** 当前生效值；**密钥类不返回** */
  value?: string;
  /** 内置默认值；**密钥类不返回** */
  defaultValue?: string;
  /** 仅密钥类：是否已有显式配置（数据库或 .env） */
  isSet?: boolean;
}

export interface SettingsView {
  /** 分组顺序（界面按它排列），避免前端再维护一份同样的顺序 */
  groups: readonly SettingGroup[];
  items: SettingItemView[];
}

/** cron 表达式段数：`@nestjs/schedule` 用的是 cron v4，6 段（含秒） */
const CRON_FIELDS = 6;

/** 只接受 http/https：这是"对外可访问的地址"，file:/javascript: 之类没有意义 */
function isHttpUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function assertLength(def: SettingDef, text: string): string {
  if (def.maxLength !== undefined && text.length > def.maxLength) {
    throw new BadRequestException({
      code: 'settings.invalidString',
      message: `${def.envName} 超过长度上限 ${def.maxLength}`,
    });
  }
  return text;
}

/**
 * 按注册表的类型把界面传来的值规范化成"存进数据库的那个字符串"。
 *
 * 校验放在这里而不是 DTO：每一项该是什么类型由**注册表**决定，不是由 DTO 决定，
 * 只有在这里才能按 type/min/max/enumValues 给出统一的错误码。
 *
 * 每个错误都**就地**摊开写成完整的 `new BadRequestException({ ... })`（code 是字符串字面量），
 * 而不是抽一个 `bad(code, message)` 之类的小工具：`test/locale-coverage.test.mjs` 靠扫源码里
 * code 字段的字符串字面量来核对多语言文案，把 code 藏在变量里它就看不见了 ——
 * 那条"每个 code 都要有 api 文案"的护栏会因此失效，反过来还会把这 10 条文案误判成"没人用"。
 * 这也正是本仓库其余抛错处的写法。
 * （写这段说明时也别在注释里把那个字面量的形状原样打出来：该测试扫的是整个文件，
 *   注释里的样本同样会被当成一个真的 code。这条已经踩过一次。）
 *
 * 规范化字符串的具体形式与 `env.ts` 的读取方式对齐（布尔存 'true'/'false'，数字存十进制串，
 * 其余 trim 后存），这样"数据库里的值"与"写在 .env 里的值"经由同一套 getter 得到一样的结果。
 */
function normalizeSetting(def: SettingDef, input: unknown): string {
  switch (def.type) {
    case 'bool': {
      if (typeof input !== 'boolean') {
        throw new BadRequestException({ code: 'settings.invalidBoolean', message: `${def.envName} 需要 true / false` });
      }
      return input ? 'true' : 'false';
    }

    case 'int': {
      const text = typeof input === 'number' ? String(input) : String(input).trim();
      const value = Number(text);
      if (text === '' || !Number.isInteger(value)) {
        throw new BadRequestException({ code: 'settings.invalidNumber', message: `${def.envName} 需要整数` });
      }
      if (def.min !== undefined && value < def.min) {
        throw new BadRequestException({ code: 'settings.invalidNumber', message: `${def.envName} 不能小于 ${def.min}` });
      }
      if (def.max !== undefined && value > def.max) {
        throw new BadRequestException({ code: 'settings.invalidNumber', message: `${def.envName} 不能大于 ${def.max}` });
      }
      return String(value);
    }

    case 'enum': {
      const text = String(input).trim();
      if (!def.enumValues?.includes(text)) {
        throw new BadRequestException({
          code: 'settings.invalidEnum',
          message: `${def.envName} 只能是 ${def.enumValues?.join(' / ')}`,
        });
      }
      return text;
    }

    case 'size': {
      const text = String(input).trim();
      if (!isValidSizeLiteral(text)) {
        throw new BadRequestException({ code: 'settings.invalidSize', message: `${def.envName} 需要形如 1024 / 10mb / 1gb` });
      }
      return text;
    }

    case 'cron': {
      const text = String(input).trim();
      if (text.split(/\s+/).filter(Boolean).length !== CRON_FIELDS) {
        throw new BadRequestException({
          code: 'settings.invalidCron',
          message: `${def.envName} 必须是 ${CRON_FIELDS} 段（秒 分 时 日 月 周）`,
        });
      }
      return text;
    }

    case 'url': {
      const text = String(input).trim();
      if (text === '') {
        if (def.allowEmpty) return text;
        throw new BadRequestException({ code: 'settings.invalidUrl', message: `${def.envName} 不能为空` });
      }
      if (!isHttpUrl(text)) {
        throw new BadRequestException({ code: 'settings.invalidUrl', message: `${def.envName} 需要 http/https 地址` });
      }
      return assertLength(def, text);
    }

    case 'secret': {
      // 不 trim：密钥里的空白可能是有效的，改掉就等于把用户的密钥改了
      if (typeof input !== 'string') {
        throw new BadRequestException({ code: 'settings.invalidString', message: `${def.envName} 需要字符串` });
      }
      return assertLength(def, input);
    }

    case 'string':
    default: {
      const text = String(input).trim();
      if (text === '' && !def.allowEmpty) {
        throw new BadRequestException({ code: 'settings.invalidString', message: `${def.envName} 不能为空` });
      }
      return assertLength(def, text);
    }
  }
}

/**
 * 实例设置的读写。
 *
 * 写路径最后一定会做两件事：重建覆盖层（`applySettingRows`）与热更定时任务
 * （`CollectionSyncService.reregister()`）。前者让**运行期读取**的项立刻生效；
 * 后者是因为 cron 一旦注册就不会自己跟着配置变。
 */
@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSetting) private readonly repo: Repository<AppSetting>,
    private readonly collectionSync: CollectionSyncService,
  ) {}

  async list(): Promise<SettingsView> {
    return {
      groups: SETTING_GROUPS,
      // 被钉死的项（容器内的数据/上传目录）**不出现**在列表里 —— 要求是"前端消失"，
      // 而不是显示成一个改不动的只读输入框。接口这一层也顺手拒绝修改，见 update()。
      items: SETTINGS.filter((def) => !isLockedEnv(def.envName)).map((def) => this.view(def)),
    };
  }

  /**
   * 保存一批配置，返回保存后的完整视图。
   *
   * 先把整批校验完再落库：任一项非法就整批拒绝，不会出现"前两项改成功、第三项报错"
   * 这种半截状态（DB 写入本身也在一个事务里）。
   */
  async update(values: Record<string, unknown>, userId: number): Promise<SettingsView> {
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      throw new BadRequestException({ code: 'settings.invalidBody', message: 'values 必须是一个对象' });
    }

    const resets: string[] = [];
    const writes: { envName: string; value: string }[] = [];

    for (const [envName, input] of Object.entries(values)) {
      const def = settingByEnv(envName);
      if (!def) {
        throw new BadRequestException({ code: 'settings.unknownKey', message: `未知的配置项：${envName}` });
      }
      // 容器内被钉死的项（数据/上传目录）连改都不许改：list() 已经不返回它们了，
      // 这里是纵深防御 —— 直接构造请求也改不动。
      if (isLockedEnv(envName)) {
        throw new BadRequestException({
          code: 'settings.locked',
          message: `${envName} 在容器内由系统固定，不能修改`,
        });
      }

      // null = 删掉覆盖，回落 .env / 内置默认
      if (input === null) {
        resets.push(envName);
        continue;
      }

      // 密钥类留空 = 不改：界面上根本看不到原值，把空串理解成"清空"会误删用户的密钥
      if (def.type === 'secret' && typeof input === 'string' && input === '') continue;

      writes.push({ envName, value: normalizeSetting(def, input) });
    }

    await this.repo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(AppSetting);
      if (resets.length > 0) await repo.delete(resets);
      for (const write of writes) {
        await repo.save(repo.create({ envName: write.envName, value: write.value, updatedBy: userId }));
      }
    });

    // 立刻对本进程生效：覆盖层重建 + cron 重新注册
    applySettingRows(await this.repo.find());
    this.collectionSync.reregister();

    return this.list();
  }

  /** 单项的对外形状（密钥类在这里被刻意剥掉值） */
  private view(def: SettingDef): SettingItemView {
    const overridden = hasOverride(def.envName);
    // `.env` 里写了 `S3_REGION=`（空值）时，getter 的 `|| 默认值` 会当作没配 ——
    // 所以"空"要按"没提供"算，否则界面会显示空串，而运行时用的是内置默认，
    // 两者不一致最容易让人以为自己配错了。
    const envValue = (process.env[def.envName] ?? '').trim();
    const source: SettingSource = overridden ? 'db' : envValue !== '' ? 'env' : 'default';

    const base = {
      envName: def.envName,
      group: def.group,
      type: def.type,
      source,
      hasOverride: overridden,
      restartRequired: def.restartRequired,
      // 只有启动期读取的项才谈得上"待重启"：运行期读取的项保存后下一个请求就是新值
      pendingRestart: def.restartRequired && isPendingRestart(def.envName),
      warning: def.warning,
      enumValues: def.enumValues,
      min: def.min,
      max: def.max,
      maxLength: def.maxLength,
      allowEmpty: def.allowEmpty,
    };

    if (def.type === 'secret') {
      // 判据是"有没有显式配置过"（数据库或 .env），而不是"生效值非空"：
      // JWT_SECRET 这类有内置默认值，用"生效值非空"会让从未配过的人也看到"已设置"
      return { ...base, isSet: overridden || envValue !== '' };
    }

    const stored = raw(def.envName);
    return {
      ...base,
      // 空串（含只写了键的空值）一律按"用内置默认"呈现，理由同上面的 source
      value: stored === undefined || stored.trim() === '' ? def.default : stored,
      defaultValue: def.default,
    };
  }
}
