import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthUser } from './jwt-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto, RegisterDto, UpdateProfileDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: { user: AuthUser }) {
    return this.auth.profile(req.user);
  }

  /** 改自己的账号资料（头像 / 取走过久提醒阈值）：不需要家庭上下文，所以用 Authed 语义的 JwtAuthGuard */
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@Req() req: { user: AuthUser }, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(req.user, dto);
  }
}
