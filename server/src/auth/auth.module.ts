import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { FamiliesModule } from '../families/families.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { env } from '../config/env';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: env.jwtSecret,
      signOptions: { expiresIn: env.jwtExpiresIn as StringValue },
    }),
    FamiliesModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  // v1 只读接口要复用账号资料（含头像）的映射，避免两处各写一份
  exports: [AuthService],
})
export class AuthModule {}
