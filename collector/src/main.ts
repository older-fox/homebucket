// 必须最先执行：env.ts 在 import 期就读环境变量，晚一步就读不到 .env 里的值
import './config/load-env';
import { Logger } from '@nestjs/common';
import { createApp } from './app.factory';
import { env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  await app.listen(env.port, env.host);
  const logger = new Logger('Bootstrap');
  logger.log(`HomeBucket Collector v${env.version} 已启动`);
  logger.log(`接口：http://${env.host}:${env.port}/${env.apiPrefix}/health`);
  logger.log(`界面：http://${env.host}:${env.port}/`);
  logger.log(
    `实例注册：${env.registrationOpen ? '开放（任何实例都能自我注册）' : '已关闭'}；数据文件：${env.dataFile}`,
  );
}

void bootstrap();
