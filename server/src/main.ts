import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

// 环境变量统一放在仓库根目录的 .env，server / web 共用；
// 这里必须在 Nest 启动前加载，Prisma 客户端初始化时需要 DATABASE_URL / DB_FILE_PATH。
loadEnv({ path: resolve(process.cwd(), '../.env') });

import { json, urlencoded } from 'express';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AppLogger } from './logger/app.logger';
import { env } from './config/env';
import { autoMigrate } from './prisma/auto-migrate';

async function bootstrap() {
  // 启动即建表：空库 / 首次启动也不会因为表不存在而失败
  if (env.autoMigrate) autoMigrate();

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

  // 前端以 0.0.0.0 对外后来源不固定，CORS_ORIGIN=* 放行全部；也可写死成逗号分隔的来源列表
  app.enableCors({
    origin: env.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix(env.apiPrefix);

  await app.listen(env.port, '0.0.0.0');
  logger.log(`server listening on http://0.0.0.0:${env.port}/${env.apiPrefix}`, 'Bootstrap');
  logger.log(`log format=${env.logFormat} level=${env.logLevels.join(',')} access=${env.accessLog}`, 'Bootstrap');
}

void bootstrap();
