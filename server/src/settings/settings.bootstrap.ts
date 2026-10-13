import { DataSource } from 'typeorm';
import { AppSetting } from '../entities/app-setting.entity';
import { buildDataSourceOptions } from '../database/data-source';
import { setOverrides } from '../config/env';
import { SETTINGS } from './settings.registry';

/**
 * 启动时把数据库里的实例设置读进覆盖层（见 `config/env.ts` 顶部那段说明）。
 *
 * ── 为什么必须卡在 `runMigrations()` 之后、`NestFactory.create()` 之前 ──
 * 有相当一部分配置是**启动期读取**的：`JwtModule.register`、S3 存储工厂的 useFactory、
 * `AppLogger` 的字段初始化、`CollectionSyncService.onModuleInit` 里注册的 cron……
 * 它们都在 `NestFactory.create()` 期间求值。而 `runMigrations()` 已经先连过一次库，
 * 所以在这两步之间读一次设置，那些 DI 期读取就会直接拿到数据库里的值 ——
 * 不需要给任何消费方加"先查配置再构造"的改造。
 *
 * ── 失败不能阻断启动 ──
 * 两种情况会读不到：老库 + `AUTO_MIGRATE=false`（`AppSetting` 表还不存在），
 * 或者数据库暂时连不上。这两种情况下继续用 `.env` 启动才是对的 ——
 * 因为"读不到设置"本身不该让服务起不来。调用方（main.ts）负责记日志。
 */
export async function loadSettingsOverrides(): Promise<void> {
  const dataSource = new DataSource(buildDataSourceOptions());

  try {
    await dataSource.initialize();
    applySettingRows(await dataSource.getRepository(AppSetting).find());
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

/**
 * 把一批 `AppSetting` 行灌进覆盖层。
 *
 * 启动路径与"保存后热更"路径共用这一个函数：两条路各自拼一遍 Map 的话，
 * 迟早会出现"启动时生效的值"和"保存后生效的值"不一致这种最难查的偏差
 * （比如一边过滤了 null 另一边没过滤）。
 */
export function applySettingRows(rows: readonly AppSetting[]): void {
  setOverrides(
    Object.fromEntries(
      rows.filter((row) => row.value !== null).map((row) => [row.envName, row.value as string]),
    ),
  );
}

/** 覆盖层要加载哪些项：注册表里全部（未覆盖的项自然回落到 .env / 默认值） */
export const SETTING_ENV_NAMES: readonly string[] = SETTINGS.map((def) => def.envName);
