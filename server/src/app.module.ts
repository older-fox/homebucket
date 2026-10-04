import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { AppLogger } from './logger/app.logger';
import { AccessLogMiddleware } from './logger/access-log.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { env } from './config/env';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AppController],
  providers: [AppLogger],
  exports: [AppLogger],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    if (env.accessLog) {
      consumer.apply(AccessLogMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
    }
  }
}
