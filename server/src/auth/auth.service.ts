import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './jwt-auth.guard';
import type { LoginDto, RegisterDto } from './dto/auth.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username: dto.username }] },
      select: { id: true },
    });
    if (exists) throw new ConflictException('邮箱或用户名已被占用');

    const user = await this.prisma.user.create({
      data: { email, username: dto.username, passwordHash: await hash(dto.password, SALT_ROUNDS) },
    });

    return this.toAuthResult(user);
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    return this.toAuthResult(user);
  }

  async profile(user: AuthUser) {
    return { id: user.id, email: user.email, username: user.username };
  }

  private async toAuthResult(user: { id: number; email: string; username: string }) {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      username: user.username,
    });

    return {
      accessToken,
      user: { id: user.id, email: user.email, username: user.username },
    };
  }
}
