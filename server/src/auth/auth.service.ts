import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare, hash } from 'bcryptjs';
import { In, Repository } from 'typeorm';
import { Attachment } from '../entities/attachment.entity';
import { FamilyMember } from '../entities/family-member.entity';
import { User } from '../entities/user.entity';
import { FamiliesService } from '../families/families.service';
import { mediaUrl } from '../common/media';
import { env } from '../config/env';
import type { AuthUser } from './jwt-auth.guard';
import type { LoginDto, RegisterDto, UpdateProfileDto } from './dto/auth.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Attachment) private readonly attachments: Repository<Attachment>,
    @InjectRepository(FamilyMember) private readonly memberships: Repository<FamilyMember>,
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
    return this.toProfile(await this.mustExist(user));
  }

  /**
   * 改自己的账号资料：头像 + 「取走过久」提醒阈值。
   *
   * 为什么头像要按「用户加入过的所有家庭」校验：Attachment 是家庭维度的表，
   * 而这个接口（`PATCH /auth/me`）不带 x-family-id 头，不能只按当前家庭查。
   * avatarId 显式传 null 表示清空；两个字段都不传就是空操作（返回当前资料）。
   */
  async updateProfile(user: AuthUser, dto: UpdateProfileDto) {
    const row = await this.mustExist(user);

    if (dto.takenOutAlertDays !== undefined) row.takenOutAlertDays = dto.takenOutAlertDays;

    if (dto.avatarId !== undefined) {
      if (dto.avatarId === null) {
        row.avatarId = null;
      } else {
        const memberships = await this.memberships.find({
          where: { userId: user.id },
          select: { familyId: true },
        });
        const familyIds = memberships.map((membership) => membership.familyId);
        const allowed =
          familyIds.length > 0 &&
          (await this.attachments.exists({ where: { id: dto.avatarId, familyId: In(familyIds) } }));
        // 复用 uploads 的「文件不存在」，不新增错误码/多语言 key
        if (!allowed) throw new NotFoundException({ code: 'upload.notFound', message: '文件不存在' });
        row.avatarId = dto.avatarId;
      }
    }

    await this.users.save(row);
    return this.toProfile(row);
  }

  /** JWT 里只有 id/email/username，要拿头像与提醒阈值必须回库读一次 */
  private async mustExist(user: AuthUser): Promise<User> {
    const row = await this.users.findOne({ where: { id: user.id } });
    if (!row) throw new UnauthorizedException({ code: 'auth.invalidToken', message: '会话无效或已过期' });
    return row;
  }

  /** 账号资料对外形状（头像只给 url，不外泄 storageKey 之类的内部字段） */
  private async toProfile(user: User) {
    // User.avatarId 没有数据库外键（见 user.entity.ts 的注释），所以这里单独查一次附件；
    // 附件被删掉时视作「没有头像」，不能因此报错
    const avatar = user.avatarId
      ? await this.attachments.findOne({ where: { id: user.avatarId } })
      : null;

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      takenOutAlertDays: user.takenOutAlertDays,
      avatarId: user.avatarId,
      avatarUrl: mediaUrl(avatar),
    };
  }

  private async toAuthResult(user: User) {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      username: user.username,
    });

    return { accessToken, user: await this.toProfile(user) };
  }
}
