import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Authed, CurrentFamily, CurrentUser, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { FamiliesService } from './families.service';
import { CreateFamilyDto, CreateInviteDto, UpdateFamilyDto, UpdateMemberDto } from './dto';

@Controller('families')
export class FamiliesController {
  constructor(private readonly families: FamiliesService) {}

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
    return this.families.update(id, family.role, dto);
  }

  @FamilyScoped()
  @Get(':id/members')
  members(@Param('id', ParseIntPipe) id: number) {
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
    return this.families.removeMember(id, family.role, user.id, userId);
  }

  @FamilyScoped()
  @Get(':id/invites')
  invites(@Param('id', ParseIntPipe) id: number) {
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
