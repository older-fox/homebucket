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
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AppLogger } from './logger/app.logger';
import { env, snapshotBootValues } from './config/env';
import { loadSettingsOverrides, SETTING_ENV_NAMES } from './settings/settings.bootstrap';
import { bootstrapAdmin } from './config/bootstrap-admin';
import { FamiliesService } from './families/families.service';
import { runMigrations } from './database/auto-migrate';
import { DataSource } from 'typeorm';

async function bootstrap() {
  // 启动即建表：空库 / 首次启动也不会因为表不存在而失败。
  // 放在 NestFactory.create 之前，这样后面的 bootstrapAdmin 才能安全查表。
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

  // bodyParser 交给下面手动注册，以便套用 MAX_UPLOAD_SIZE
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });

  const logger = app.get(AppLogger);
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

  // 空库首次启动：按配置创建默认管理员（AUTO_CREATE_ADMIN / DEFAULT_ADMIN_*）
  try {
    await bootstrapAdmin(app.get(DataSource), app.get(FamiliesService), logger);
  } catch (error) {
    logger.error(`默认管理员初始化失败：${(error as Error).message}`, undefined, 'Bootstrap');
  }

  await app.listen(env.port, '0.0.0.0');
  logger.log(`server listening on http://0.0.0.0:${env.port}/${env.apiPrefix}`, 'Bootstrap');
  logger.log(`log format=${env.logFormat} level=${env.logLevels.join(',')} access=${env.accessLog}`, 'Bootstrap');
}

void bootstrap();
