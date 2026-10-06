import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FamilyMember } from '../entities/family-member.entity';
import type { AuthUser } from '../auth/jwt-auth.guard';

export interface FamilyContext {
  id: number;
  role: string;
  userId: number;
}

/**
 * 家庭上下文：校验 X-Family-Id 是否属于当前用户，缺省回退到用户的个人家庭。
 * 业务代码必须使用 ctx.family.id 过滤数据，保证多家庭之间数据隔离。
 */
@Injectable()
export class FamilyContextGuard implements CanActivate {
  constructor(@InjectRepository(FamilyMember) private readonly members: Repository<FamilyMember>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthUser;
      family?: FamilyContext;
    }>();

    const user = req.user;
    if (!user) throw new UnauthorizedException({ code: 'auth.missingToken', message: '缺少登录凭证' });

    const raw = req.headers['x-family-id'];
    const headerValue = Array.isArray(raw) ? raw[0] : raw;
    const familyId = headerValue ? Number(headerValue) : NaN;

    // 指定了家庭就按 (familyId, userId) 精确查成员资格；
    // 否则回退到该用户的第一个家庭，优先个人家庭。
    // 回退那条用 QueryBuilder 而不是 find()：需要"按关联表的列(isPersonal)排序"，
    // 同时只取两列 —— find() 的 select 与 relations 叠加在这种场景下行为不直观，显式 join 更稳。
    const membership = Number.isInteger(familyId)
      ? await this.members.findOne({
          where: { familyId, userId: user.id },
          select: { familyId: true, role: true },
        })
      : await this.members
          .createQueryBuilder('member')
          .innerJoin('member.family', 'family')
          .select(['member.familyId', 'member.role'])
          .where('member.userId = :userId', { userId: user.id })
          .orderBy('family.isPersonal', 'DESC')
          .addOrderBy('member.id', 'ASC')
          .getOne();

    if (!membership) throw new ForbiddenException({ code: 'family.accessDenied', message: '无权访问该家庭的数据' });

    req.family = { id: membership.familyId, role: membership.role, userId: user.id };
    return true;
  }
}
