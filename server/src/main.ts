import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

// 环境变量统一放在仓库根目录的 .env，server / web 共用；
// 必须在 Nest 启动前加载：TypeORM 建数据源时需要 DATABASE_URL / DB_FILE_PATH。
loadEnv({ path: resolve(process.cwd(), '../.env') });

import { json, urlencoded } from 'express';
import { mkdirSync } from 'node:fs';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { flattenValidationErrors } from './common/validation';
import { mediaUrlPrefix } from './common/media';
import { isLockedDown, LOCKED_CONTAINER_VALUES, warnOnLockedConflicts } from './common/container';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AppLogger } from './logger/app.logger';
import { applyLockedValues, env, snapshotBootValues } from './config/env';
import { loadSettingsOverrides, SETTING_ENV_NAMES } from './settings/settings.bootstrap';
import { runMigrations } from './database/auto-migrate';
import { probeDatabase } from './database/probe';
import { SetupRestrictedModule } from './setup/setup-restricted.module';

/**
 * 两种根模块共用的全局配置。
 *
 * 抽出来是为了让"受限启动"与正常启动在**可观测行为上一致**：同样的日志格式、
 * 同样的请求体上限、同样的 CORS 与校验错误信封。引导页自己也是走这些约定与后端打交道的，
 * 两边不一致会出现"引导页能开、登录页不能开"这种极难解释的现象。
 */
function configureApp(app: NestExpressApplication, logger: AppLogger): void {
  app.useLogger(logger);
  app.flushLogs();

  // 请求体 / 上传体积上限（MAX_UPLOAD_SIZE，默认 1gb）
  app.use(json({ limit: env.maxUploadSize }));
  app.use(urlencoded({ extended: true, limit: env.maxUploadSize }));

  // 本地存储模式下，上传的文件由后端直接提供（/api/media/<key>，走前端同源代理）
  if (env.storageDriver === 'local') {
    mkdirSync(env.uploadDir, { recursive: true });
    // 前缀与 media.ts 的 mediaUrl() 同源推导，改 API_PREFIX 时两边不会走散
    app.useStaticAssets(env.uploadDir, { prefix: mediaUrlPrefix(), index: false, fallthrough: true });
    logger.log(`uploads dir: ${env.uploadDir}`, 'Bootstrap');
  }

  // 前端以 0.0.0.0 对外后来源不固定，CORS_ORIGIN=* 放行全部；也可写死成逗号分隔的来源列表
  app.enableCors({
    origin: env.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // 校验失败统一成 { code, fields }，前端按 code / 约束名做多语言
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException({
          code: 'validation.failed',
          message: '请求参数不合法',
          fields: flattenValidationErrors(errors),
        }),
    }),
  );
  app.setGlobalPrefix(env.apiPrefix);
}

/**
 * 受限启动：连不上数据库时只提供引导接口。
 *
 * 为什么不让进程直接退出（那样更简单）：用户会看到容器在重启循环里打转，日志里只有
 * 一串连接错误，**没有任何可操作的入口**。而"引导页要用户填连接参数"这条路径本身
 * 需要 HTTP 服务活着。
 *
 * 探活与 `/api/config` 也必须能用（否则容器一直不健康、前端也判断不出该去引导页），
 * 所以这两条在受限模块里由 `SetupProbeBaseController` 顶上。
 */
async function startRestricted(reason: string): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(SetupRestrictedModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  const logger = app.get(AppLogger);
  configureApp(app, logger);

  await app.listen(env.port, '0.0.0.0');
  logger.warn(`数据库不可用，已进入受限启动（只提供引导接口）：${reason}`, 'Bootstrap');
  // 引导页由前端进程提供（WEB_PORT，默认 3000），后端并不认识那个端口，所以这里只说路径
  logger.warn('请打开前端的 /setup 页面完成数据库配置（容器内前端默认监听 3000）', 'Bootstrap');
}

async function bootstrap() {
  /*
   * 第一件事：容器内把数据位置钉死（DATA_DIR=/data、UPLOAD_DIR=/data/uploads、
   * DB_FILE_PATH=/data/homebucket.db）。必须早于任何配置读取 —— 后面每一处
   * （迁移、数据源、静态目录、日志）都从 env 取这些值。
   *
   * 只在"容器 + 生产环境"下生效，否则开发机/CI 会被强制 /data（见 common/container.ts）。
   */
  if (isLockedDown()) {
    applyLockedValues(LOCKED_CONTAINER_VALUES);
    warnOnLockedConflicts();
  }

  /*
   * 先探一次数据库，用它的结果决定**加载哪个根模块**。
   *
   * 为什么是"探"而不是"让迁移失败来告诉我"：探测结果决定用哪个根模块启动，
   * 必须是明确信号；靠迁移抛错会把"迁移 SQL 写错"也当成"连不上库"。
   * 探测自带 3 秒超时 —— Nest 的 TypeOrmModule 默认重试 10 次 × 3s，
   * 直接让它失败的话，新实例要等半分钟才看得到引导页。
   */
  const probe = await probeDatabase();
  if (!probe.ok) {
    await startRestricted(probe.reason);
    return;
  }

  // 启动即建表：空库 / 首次启动也不会因为表不存在而失败。
  // 放在 NestFactory.create 之前，这样后面的设置覆盖层与引导接口才能安全查表。
  // 迁移失败不阻断进程，交给 /health 报 degraded（与改造前行为一致）。
  if (env.autoMigrate) {
    try {
      await runMigrations();
    } catch (error) {
      console.error(`[migrate] 迁移失败：${(error as Error).message}`);
    }
  }

  // 「设置 → 实例设置」存在数据库里的值在这里叠加到配置之上（数据库 > .env > 默认值）。
  //
  // 位置很关键：必须在 NestFactory.create() **之前** —— JwtModule、S3 存储工厂、AppLogger
  // 的字段初始化、cron 注册都在那一步期间读取配置，放前面它们才能拿到库里的值；
  // 又必须在 runMigrations() **之后** —— 表得先建出来。
  // 读不到（老库 + AUTO_MIGRATE=false、或库暂时连不上）只记日志，继续用 .env 启动。
  try {
    await loadSettingsOverrides();
  } catch (error) {
    console.error(`[settings] 数据库设置读取失败，本次一律用 .env 兜底：${(error as Error).message}`);
  }
  // 记下"本次进程启动时各配置的实际生效值"，用于判断某项是否"已保存但需重启才生效"
  snapshotBootValues(SETTING_ENV_NAMES);

  // bodyParser 交给 configureApp 手动注册，以便套用 MAX_UPLOAD_SIZE
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  const logger = app.get(AppLogger);
  configureApp(app, logger);

  // 第一个管理员不再由 .env 的 DEFAULT_ADMIN_* 自动创建：改由首启引导页创建
  // （完成前所有业务接口返回 503 setup.required，见 src/setup/）。

  await app.listen(env.port, '0.0.0.0');
  logger.log(`server listening on http://0.0.0.0:${env.port}/${env.apiPrefix}`, 'Bootstrap');
  logger.log(`log format=${env.logFormat} level=${env.logLevels.join(',')} access=${env.accessLog}`, 'Bootstrap');
}

void bootstrap();
