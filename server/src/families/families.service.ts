import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomToken } from '../common/id';
import { env } from '../config/env';
import type { CreateFamilyDto, CreateInviteDto, UpdateFamilyDto } from './dto';

const ROLE_ORDER: Record<string, number> = { member: 0, admin: 1, owner: 2 };

@Injectable()
export class FamiliesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 注册后调用：创建个人家庭并把用户设为 owner */
  async ensurePersonalFamily(userId: number, username: string) {
    const existing = await this.prisma.familyMember.findFirst({
      where: { userId, family: { isPersonal: true } },
      select: { familyId: true },
    });
    if (existing) return existing.familyId;

    const family = await this.prisma.family.create({
      data: {
        name: username,
        isPersonal: true,
        currency: env.defaultCurrency,
        locale: env.defaultLocale,
        ownerId: userId,
        members: { create: { userId, role: 'owner' } },
      },
      select: { id: true },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { defaultFamilyId: family.id },
    });

    return family.id;
  }

  async list(userId: number) {
    const rows = await this.prisma.familyMember.findMany({
      where: { userId },
      orderBy: [{ family: { isPersonal: 'desc' } }, { id: 'asc' }],
      select: {
        role: true,
        family: {
          select: {
            id: true,
            name: true,
            currency: true,
            locale: true,
            timeZone: true,
            isPersonal: true,
            ownerId: true,
            _count: { select: { members: true, items: true, locations: true } },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.family.id,
      name: row.family.name,
      currency: row.family.currency,
      locale: row.family.locale,
      timeZone: row.family.timeZone,
      isPersonal: row.family.isPersonal,
      isOwner: row.family.ownerId === userId,
      role: row.role,
      memberCount: row.family._count.members,
      itemCount: row.family._count.items,
      locationCount: row.family._count.locations,
    }));
  }

  async create(userId: number, dto: CreateFamilyDto) {
    const family = await this.prisma.family.create({
      data: {
        name: dto.name,
        isPersonal: false,
        currency: env.defaultCurrency,
        locale: env.defaultLocale,
        ownerId: userId,
        members: { create: { userId, role: 'owner' } },
      },
      select: { id: true, name: true },
    });
    return family;
  }

  async update(familyId: number, role: string, dto: UpdateFamilyDto) {
    if (ROLE_ORDER[role] < ROLE_ORDER.admin) throw new ForbiddenException({ code: 'family.adminOnly', message: '只有管理员可以修改家庭设置' });
    return this.prisma.family.update({
      where: { id: familyId },
      data: {
        name: dto.name,
        currency: dto.currency?.toUpperCase(),
        locale: dto.locale,
        timeZone: dto.timeZone,
      },
      select: { id: true, name: true, currency: true, locale: true, timeZone: true },
    });
  }

  async members(familyId: number) {
    const rows = await this.prisma.familyMember.findMany({
      where: { familyId },
      orderBy: [{ role: 'desc' }, { id: 'asc' }],
      select: {
        role: true,
        createdAt: true,
        user: { select: { id: true, username: true, email: true } },
      },
    });
    return rows.map((row) => ({ ...row.user, role: row.role, joinedAt: row.createdAt }));
  }

  async updateMemberRole(familyId: number, actorRole: string, targetUserId: number, role: string) {
    if (actorRole !== 'owner') throw new ForbiddenException({ code: 'family.ownerOnly', message: '只有家庭所有者可以调整成员角色' });
    if (!['admin', 'member'].includes(role)) throw new BadRequestException({ code: 'family.roleInvalid', message: '角色只能是 admin 或 member' });

    const target = await this.prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId: targetUserId } },
      select: { role: true },
    });
    if (!target) throw new NotFoundException({ code: 'family.memberNotFound', message: '成员不存在' });
    if (target.role === 'owner') throw new BadRequestException({ code: 'family.ownerImmutable', message: '不能修改所有者的角色' });

    await this.prisma.familyMember.update({
      where: { familyId_userId: { familyId, userId: targetUserId } },
      data: { role },
    });
    return { ok: true };
  }

  async removeMember(familyId: number, actorRole: string, actorUserId: number, targetUserId: number) {
    const leavingSelf = actorUserId === targetUserId;
    if (!leavingSelf && actorRole !== 'owner') throw new ForbiddenException({ code: 'family.ownerOnly', message: '只有家庭所有者可以移除成员' });

    const target = await this.prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId: targetUserId } },
      select: { role: true },
    });
    if (!target) throw new NotFoundException({ code: 'family.memberNotFound', message: '成员不存在' });
    if (target.role === 'owner') throw new BadRequestException({ code: 'family.ownerImmutable', message: '家庭所有者不能被移除' });

    await this.prisma.familyMember.delete({
      where: { familyId_userId: { familyId, userId: targetUserId } },
    });

    // 被移除/退出后，默认家庭若指向它需要回退到个人家庭
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { defaultFamilyId: true },
    });
    if (user?.defaultFamilyId === familyId) {
      const personal = await this.prisma.familyMember.findFirst({
        where: { userId: targetUserId, family: { isPersonal: true } },
        select: { familyId: true },
      });
      await this.prisma.user.update({
        where: { id: targetUserId },
        data: { defaultFamilyId: personal?.familyId ?? null },
      });
    }

    return { ok: true };
  }

  // ---------- 邀请 ----------

  async createInvite(familyId: number, actorRole: string, userId: number, dto: CreateInviteDto) {
    if (actorRole !== 'owner') throw new ForbiddenException({ code: 'family.ownerOnly', message: '只有家庭所有者可以创建邀请' });
    const invite = await this.prisma.familyInvite.create({
      data: {
        familyId,
        createdById: userId,
        token: randomToken(),
        expiresAt: dto.expiresInDays
          ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
          : null,
      },
      select: { id: true, token: true, expiresAt: true, createdAt: true },
    });
    return { ...invite, url: `/invite/${invite.token}` };
  }

  async listInvites(familyId: number) {
    const rows = await this.prisma.familyInvite.findMany({
      where: { familyId, revokedAt: null },
      orderBy: { id: 'desc' },
      select: { id: true, token: true, expiresAt: true, createdAt: true },
    });
    return rows.map((row) => ({ ...row, url: `/invite/${row.token}` }));
  }

  async revokeInvite(familyId: number, actorRole: string, inviteId: number) {
    if (actorRole !== 'owner') throw new ForbiddenException({ code: 'family.ownerOnly', message: '只有家庭所有者可以撤销邀请' });
    const invite = await this.prisma.familyInvite.findFirst({
      where: { id: inviteId, familyId },
      select: { id: true },
    });
    if (!invite) throw new NotFoundException({ code: 'invite.notFound', message: '邀请不存在' });
    await this.prisma.familyInvite.update({
      where: { id: inviteId },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  /** 公开接口：用 token 查看邀请信息，不要求登录 */
  async inviteInfo(token: string) {
    const invite = await this.prisma.familyInvite.findUnique({
      where: { token },
      select: {
        expiresAt: true,
        revokedAt: true,
        family: { select: { id: true, name: true, _count: { select: { members: true } } } },
        createdBy: { select: { username: true } },
      },
    });
    if (!invite) throw new NotFoundException({ code: 'invite.invalid', message: '邀请链接无效' });
    if (invite.revokedAt) throw new BadRequestException({ code: 'invite.revoked', message: '邀请链接已被撤销' });
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({ code: 'invite.expired', message: '邀请链接已过期' });
    }
    return {
      familyId: invite.family.id,
      familyName: invite.family.name,
      inviterName: invite.createdBy.username,
      memberCount: invite.family._count.members,
      expiresAt: invite.expiresAt,
    };
  }

  /** 已登录用户接受邀请：加入家庭 */
  async acceptInvite(token: string, userId: number) {
    const info = await this.inviteInfo(token);
    const existing = await this.prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId: info.familyId, userId } },
      select: { role: true },
    });
    if (existing) return { familyId: info.familyId, alreadyMember: true };

    await this.prisma.familyMember.create({
      data: { familyId: info.familyId, userId, role: 'member' },
    });
    return { familyId: info.familyId, alreadyMember: false };
  }
}
