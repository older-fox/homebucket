import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Family } from '../entities/family.entity';
import { FamilyInvite } from '../entities/family-invite.entity';
import { FamilyMember } from '../entities/family-member.entity';
import { Item } from '../entities/item.entity';
import { Location } from '../entities/location.entity';
import { User } from '../entities/user.entity';
import { randomToken } from '../common/id';
import { countByForeignKey } from '../common/relation-count';
import { env } from '../config/env';
import type { CreateFamilyDto, CreateInviteDto, UpdateFamilyDto } from './dto';

const ROLE_ORDER: Record<string, number> = { member: 0, admin: 1, owner: 2 };

@Injectable()
export class FamiliesService {
  constructor(
    @InjectRepository(Family) private readonly families: Repository<Family>,
    @InjectRepository(FamilyMember) private readonly familyMembers: Repository<FamilyMember>,
    @InjectRepository(FamilyInvite) private readonly invites: Repository<FamilyInvite>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(Location) private readonly locations: Repository<Location>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * 查询用户的个人家庭 id。
   *
   * ⚠️ 这里刻意用 QueryBuilder，而不是
   *   `findOne({ where: { userId, family: { isPersonal: true } }, select: {...} })`
   * 因为 TypeORM 1.1.1 在「where 里带关联过滤 + 同时出现 select」时会生成
   *   SELECT ... distinctAlias.FamilyMember_id ...
   * 这种引用不存在列的 SQL（MySQL 报 Unknown column，SQLite 报 no such column），
   * 是该版本的缺陷（已实测复现）。显式 innerJoin 可以完全绕开这条有问题的代码路径。
   * 另外注意：单独的 where 关联过滤（不带 select）是正常的，别因此以为关联过滤全都不能用。
   */
  private async findPersonalFamilyId(userId: number): Promise<number | null> {
    const row = await this.familyMembers
      .createQueryBuilder('member')
      .innerJoin('member.family', 'family')
      .select('member.familyId', 'familyId')
      .where('member.userId = :userId', { userId })
      .andWhere('family.isPersonal = :personal', { personal: true })
      .getRawOne<{ familyId: number | string }>();
    return row ? Number(row.familyId) : null;
  }

  /** 注册后调用：创建个人家庭并把用户设为 owner */
  async ensurePersonalFamily(userId: number, username: string) {
    const existing = await this.findPersonalFamilyId(userId);
    if (existing) return existing;

    // 建家庭 + 建 owner 成员必须一起成功，否则会留下没有成员的家庭
    const familyId = await this.dataSource.transaction(async (manager) => {
      const family = await manager.save(
        manager.create(Family, {
          name: username,
          isPersonal: true,
          currency: env.defaultCurrency,
          locale: env.defaultLocale,
          ownerId: userId,
        }),
      );
      await manager.save(
        manager.create(FamilyMember, { familyId: family.id, userId, role: 'owner' }),
      );
      return family.id;
    });

    await this.users.update({ id: userId }, { defaultFamilyId: familyId });

    return familyId;
  }

  async list(userId: number) {
    // 个人家庭排前面，其次按成员记录 id 升序（与改造前的排序一致）。
    // 用 join 是因为排序要落到关联表 family.isPersonal 上。
    const rows = await this.familyMembers
      .createQueryBuilder('member')
      .innerJoinAndSelect('member.family', 'family')
      .where('member.userId = :userId', { userId })
      .orderBy('family.isPersonal', 'DESC')
      .addOrderBy('member.id', 'ASC')
      .getMany();

    const familyIds = rows.map((row) => row.family.id);

    // 原来是 Prisma 的 `_count: { select: { members, items, locations } }`；
    // TypeORM 1.x 删掉了 loadRelationCountAndMap，这里各用一次聚合查询代替
    const [memberCounts, itemCounts, locationCounts] = await Promise.all([
      countByForeignKey(this.familyMembers, 'familyId', familyIds),
      countByForeignKey(this.items, 'familyId', familyIds),
      countByForeignKey(this.locations, 'familyId', familyIds),
    ]);

    return rows.map((row) => ({
      id: row.family.id,
      name: row.family.name,
      currency: row.family.currency,
      locale: row.family.locale,
      timeZone: row.family.timeZone,
      isPersonal: row.family.isPersonal,
      isOwner: row.family.ownerId === userId,
      role: row.role,
      memberCount: memberCounts.get(row.family.id) ?? 0,
      itemCount: itemCounts.get(row.family.id) ?? 0,
      locationCount: locationCounts.get(row.family.id) ?? 0,
    }));
  }

  async create(userId: number, dto: CreateFamilyDto) {
    return this.dataSource.transaction(async (manager) => {
      const family = await manager.save(
        manager.create(Family, {
          name: dto.name,
          isPersonal: false,
          currency: env.defaultCurrency,
          locale: env.defaultLocale,
          ownerId: userId,
        }),
      );
      await manager.save(manager.create(FamilyMember, { familyId: family.id, userId, role: 'owner' }));
      return { id: family.id, name: family.name };
    });
  }

  async update(familyId: number, role: string, dto: UpdateFamilyDto) {
    if (ROLE_ORDER[role] < ROLE_ORDER.admin) throw new ForbiddenException({ code: 'family.adminOnly', message: '只有管理员可以修改家庭设置' });

    const family = await this.families.findOne({ where: { id: familyId } });
    if (!family) throw new NotFoundException({ code: 'family.notFound', message: '家庭不存在' });

    // 只覆盖传了的字段：Prisma 里 undefined 表示"不改"，这里保持同样语义
    if (dto.name !== undefined) family.name = dto.name;
    if (dto.currency !== undefined) family.currency = dto.currency.toUpperCase();
    if (dto.locale !== undefined) family.locale = dto.locale;
    if (dto.timeZone !== undefined) family.timeZone = dto.timeZone;

    const saved = await this.families.save(family);
    return {
      id: saved.id,
      name: saved.name,
      currency: saved.currency,
      locale: saved.locale,
      timeZone: saved.timeZone,
    };
  }

  async members(familyId: number) {
    const rows = await this.familyMembers.find({
      where: { familyId },
      // role 是字符串，DESC 的字典序为 owner > member > admin（沿用改造前的行为）
      order: { role: 'DESC', id: 'ASC' },
      relations: { user: true },
    });
    return rows.map((row) => ({
      id: row.user.id,
      username: row.user.username,
      email: row.user.email,
      role: row.role,
      joinedAt: row.createdAt,
    }));
  }

  async updateMemberRole(familyId: number, actorRole: string, targetUserId: number, role: string) {
    if (actorRole !== 'owner') throw new ForbiddenException({ code: 'family.ownerOnly', message: '只有家庭所有者可以调整成员角色' });
    if (!['admin', 'member'].includes(role)) throw new BadRequestException({ code: 'family.roleInvalid', message: '角色只能是 admin 或 member' });

    const target = await this.familyMembers.findOne({
      where: { familyId, userId: targetUserId },
      select: { role: true },
    });
    if (!target) throw new NotFoundException({ code: 'family.memberNotFound', message: '成员不存在' });
    if (target.role === 'owner') throw new BadRequestException({ code: 'family.ownerImmutable', message: '不能修改所有者的角色' });

    await this.familyMembers.update({ familyId, userId: targetUserId }, { role });
    return { ok: true };
  }

  async removeMember(familyId: number, actorRole: string, actorUserId: number, targetUserId: number) {
    const leavingSelf = actorUserId === targetUserId;
    if (!leavingSelf && actorRole !== 'owner') throw new ForbiddenException({ code: 'family.ownerOnly', message: '只有家庭所有者可以移除成员' });

    const target = await this.familyMembers.findOne({
      where: { familyId, userId: targetUserId },
      select: { role: true },
    });
    if (!target) throw new NotFoundException({ code: 'family.memberNotFound', message: '成员不存在' });
    if (target.role === 'owner') throw new BadRequestException({ code: 'family.ownerImmutable', message: '家庭所有者不能被移除' });

    await this.familyMembers.delete({ familyId, userId: targetUserId });

    // 被移除/退出后，默认家庭若指向它需要回退到个人家庭
    const user = await this.users.findOne({
      where: { id: targetUserId },
      select: { id: true, defaultFamilyId: true },
    });
    if (user?.defaultFamilyId === familyId) {
      // 个人家庭 id 用 findPersonalFamilyId()：见那里的注释，关联过滤 + select 会踩 TypeORM 缺陷
      const personalFamilyId = await this.findPersonalFamilyId(targetUserId);
      await this.users.update({ id: targetUserId }, { defaultFamilyId: personalFamilyId });
    }

    return { ok: true };
  }

  // ---------- 邀请 ----------

  async createInvite(familyId: number, actorRole: string, userId: number, dto: CreateInviteDto) {
    if (actorRole !== 'owner') throw new ForbiddenException({ code: 'family.ownerOnly', message: '只有家庭所有者可以创建邀请' });

    const invite = await this.invites.save(
      this.invites.create({
        familyId,
        createdById: userId,
        token: randomToken(),
        expiresAt: dto.expiresInDays
          ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
          : null,
        revokedAt: null,
      }),
    );

    return {
      id: invite.id,
      token: invite.token,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      url: `/invite/${invite.token}`,
    };
  }

  async listInvites(familyId: number) {
    const rows = await this.invites.find({
      // ⚠️ 必须用 IsNull()：TypeORM 1.x 的 where 里放字面量 null 会直接抛 TypeORMError
      // （invalidWhereValuesBehavior 默认 "throw"），Prisma 时代写 null 是合法的
      where: { familyId, revokedAt: IsNull() },
      order: { id: 'DESC' },
      select: { id: true, token: true, expiresAt: true, createdAt: true },
    });
    return rows.map((row) => ({ ...row, url: `/invite/${row.token}` }));
  }

  async revokeInvite(familyId: number, actorRole: string, inviteId: number) {
    if (actorRole !== 'owner') throw new ForbiddenException({ code: 'family.ownerOnly', message: '只有家庭所有者可以撤销邀请' });

    const invite = await this.invites.findOne({ where: { id: inviteId, familyId }, select: { id: true } });
    if (!invite) throw new NotFoundException({ code: 'invite.notFound', message: '邀请不存在' });

    // 用 revokedAt 软撤销（保留审计痕迹），不是删除
    await this.invites.update({ id: inviteId }, { revokedAt: new Date() });
    return { ok: true };
  }

  /** 公开接口：用 token 查看邀请信息，不要求登录 */
  async inviteInfo(token: string) {
    const invite = await this.invites.findOne({
      where: { token },
      relations: { family: true, createdBy: true },
    });
    if (!invite) throw new NotFoundException({ code: 'invite.invalid', message: '邀请链接无效' });
    if (invite.revokedAt) throw new BadRequestException({ code: 'invite.revoked', message: '邀请链接已被撤销' });
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({ code: 'invite.expired', message: '邀请链接已过期' });
    }

    const memberCount = await this.familyMembers.count({ where: { familyId: invite.family.id } });

    return {
      familyId: invite.family.id,
      familyName: invite.family.name,
      inviterName: invite.createdBy.username,
      memberCount,
      expiresAt: invite.expiresAt,
    };
  }

  /** 已登录用户接受邀请：加入家庭 */
  async acceptInvite(token: string, userId: number) {
    const info = await this.inviteInfo(token);
    const existing = await this.familyMembers.findOne({
      where: { familyId: info.familyId, userId },
      select: { role: true },
    });
    if (existing) return { familyId: info.familyId, alreadyMember: true };

    await this.familyMembers.save(
      this.familyMembers.create({ familyId: info.familyId, userId, role: 'member' }),
    );
    return { familyId: info.familyId, alreadyMember: false };
  }
}
