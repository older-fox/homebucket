import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Authed, CurrentFamily, CurrentUser, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { FamiliesService } from './families.service';
import { CreateFamilyDto, CreateInviteDto, UpdateFamilyDto, UpdateMemberDto } from './dto';

@Controller('families')
export class FamiliesController {
  constructor(private readonly families: FamiliesService) {}

  /**
   * 路径里的 :id 必须就是 X-Family-Id 解析出的当前家庭。
   *
   * @FamilyScoped() 只校验「登录用户是不是 header 里那个家庭的成员」，它并不知道
   * 路径上的 :id。若直接把路径 id 交给 service，成员只属于家庭 A 的人就能拿着
   * X-Family-Id: A 去读写家庭 B（越权 IDOR）。角色（family.role）也来自 header 家庭，
   * 两者一旦不一致，任何角色判断都失去意义，因此这里直接拒绝。
   */
  private assertActiveFamily(id: number, family: FamilyContext) {
    if (id !== family.id) {
      throw new ForbiddenException({ code: 'family.contextMismatch', message: '只能操作当前家庭' });
    }
  }

  /** 我加入的所有家庭 */
  @Authed()
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.families.list(user.id);
  }

  @Authed()
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFamilyDto) {
    return this.families.create(user.id, dto);
  }

  @FamilyScoped()
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentFamily() family: FamilyContext,
    @Body() dto: UpdateFamilyDto,
  ) {
    this.assertActiveFamily(id, family);
    return this.families.update(id, family.role, dto);
  }

  @FamilyScoped()
  @Get(':id/members')
  members(@Param('id', ParseIntPipe) id: number, @CurrentFamily() family: FamilyContext) {
    this.assertActiveFamily(id, family);
    return this.families.members(id);
  }

  @FamilyScoped()
  @Patch(':id/members/:userId')
  updateMember(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentFamily() family: FamilyContext,
    @Body() dto: UpdateMemberDto,
  ) {
    this.assertActiveFamily(id, family);
    return this.families.updateMemberRole(id, family.role, userId, dto.role);
  }

  @FamilyScoped()
  @Delete(':id/members/:userId')
  removeMember(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
  ) {
    this.assertActiveFamily(id, family);
    return this.families.removeMember(id, family.role, user.id, userId);
  }

  @FamilyScoped()
  @Get(':id/invites')
  invites(@Param('id', ParseIntPipe) id: number, @CurrentFamily() family: FamilyContext) {
    this.assertActiveFamily(id, family);
    return this.families.listInvites(id);
  }

  @FamilyScoped()
  @Post(':id/invites')
  createInvite(
    @Param('id', ParseIntPipe) id: number,
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInviteDto,
  ) {
    this.assertActiveFamily(id, family);
    return this.families.createInvite(id, family.role, user.id, dto);
  }

  @FamilyScoped()
  @Delete('invites/:inviteId')
  revokeInvite(
    @Param('inviteId', ParseIntPipe) inviteId: number,
    @CurrentFamily() family: FamilyContext,
  ) {
    return this.families.revokeInvite(family.id, family.role, inviteId);
  }
}
