import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare, hash } from 'bcryptjs';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { FamiliesService } from '../families/families.service';
import { env } from '../config/env';
import type { AuthUser } from './jwt-auth.guard';
import type { LoginDto, RegisterDto } from './dto/auth.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly families: FamiliesService,
  ) {}

  async register(dto: RegisterDto) {
    // 注册总开关：关闭后任何人（含凭邀请链接）都不能创建账号
    if (!env.allowRegistration) {
      throw new ForbiddenException({ code: 'auth.registrationDisabled', message: '当前实例未开放注册' });
    }

    const username = dto.username.trim();
    const email = dto.email?.trim().toLowerCase() || null;

    // 用户名是登录凭据，必须唯一；邮箱填了也要唯一。
    // 原来是 OR 查询，这里保持同样的语义：只要 username 或 email 任一命中就冲突。
    // 顺手把命中的那一行读出来，判断到底是哪个字段撞了：只报「用户名已被占用」会在
    // 邮箱冲突时误导用户。前端 api.auth.emailTaken / api.auth.usernameTaken 两个
    // 多语言 key 也据此分别命中。
    const taken = await this.users.findOne({
      where: email ? [{ username }, { email }] : [{ username }],
      select: { id: true, username: true, email: true },
    });
    if (taken) {
      throw new ConflictException(
        taken.username !== username
          ? { code: 'auth.emailTaken', message: '邮箱已被占用' }
          : { code: 'auth.usernameTaken', message: '用户名已被占用' },
      );
    }

    // 邀请链接先校验，无效就直接报错，避免注册完才发现
    if (dto.inviteToken) await this.families.inviteInfo(dto.inviteToken);

    const user = await this.users.save(
      this.users.create({
        username,
        email,
        passwordHash: await hash(dto.password, SALT_ROUNDS),
        defaultFamilyId: null,
      }),
    );

    // 每个用户都有一个自己的个人家庭
    await this.families.ensurePersonalFamily(user.id, user.username);

    if (dto.inviteToken) {
      await this.families.acceptInvite(dto.inviteToken, user.id);
    }

    return this.toAuthResult(user);
  }

  /** 登录：使用用户名 + 密码（邮箱不再作为登录凭据） */
  async login(dto: LoginDto) {
    const username = dto.username.trim();
    const user = await this.users.findOne({ where: { username } });
    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException({ code: 'auth.invalidCredentials', message: '用户名或密码错误' });
    }

    return this.toAuthResult(user);
  }

  async profile(user: AuthUser) {
    return { id: user.id, email: user.email, username: user.username };
  }

  private async toAuthResult(user: { id: number; email: string | null; username: string }) {
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
