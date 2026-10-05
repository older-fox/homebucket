import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { FamiliesService } from '../families/families.service';
import type { AuthUser } from './jwt-auth.guard';
import type { LoginDto, RegisterDto } from './dto/auth.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly families: FamiliesService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username: dto.username }] },
      select: { id: true },
    });
    if (exists) throw new ConflictException({ code: 'auth.emailTaken', message: '邮箱或用户名已被占用' });

    // 邀请链接先校验，无效就直接报错，避免注册完才发现
    if (dto.inviteToken) await this.families.inviteInfo(dto.inviteToken);

    const user = await this.prisma.user.create({
      data: { email, username: dto.username, passwordHash: await hash(dto.password, SALT_ROUNDS) },
    });

    // 每个用户都有一个自己的个人家庭
    await this.families.ensurePersonalFamily(user.id, user.username);

    if (dto.inviteToken) {
      await this.families.acceptInvite(dto.inviteToken, user.id);
    }

    return this.toAuthResult(user);
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException({ code: 'auth.invalidCredentials', message: '邮箱或密码错误' });
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
