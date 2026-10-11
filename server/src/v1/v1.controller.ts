import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { CurrentFamily, CurrentUser } from '../common/decorators';
import { FamilyContextGuard, type FamilyContext } from '../common/family-context.guard';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { AuthService } from '../auth/auth.service';
import { FamiliesService } from '../families/families.service';
import { ItemsService } from '../items/items.service';
import { QueryItemsDto } from '../items/dto';
import { LocationsService } from '../locations/locations.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityQueryDto } from '../activity/dto';
import { ApiKeyGuard } from '../api-keys/api-key.guard';

/**
 * 给脚本 / 外部程序（Home Assistant、备份任务、自建面板）用的 **只读** API。
 *
 * ── 约定 ──
 *
 * 1. **一律 GET**：这一层永远不该有写操作。想加写接口请先想清楚审计与幂等，
 *    并同步更新 server/test/api-key.test.mjs 里「v1 只有 GET」的护栏。
 * 2. 鉴权用 API key（`X-Api-Key: hb_xxx`，也接受 `Authorization: Bearer hb_xxx`），
 *    不用 JWT 会话；能看到的家庭与角色和 key 所属账号完全一致。
 * 3. 家庭选择沿用 `x-family-id` 请求头，缺省回退到默认家庭（优先个人家庭）——
 *    与网页端行为一致，因此家庭级接口都挂 FamilyContextGuard。
 * 4. 返回体直接复用网页端 service 的对外结构（已经做过显式字段映射），
 *    不额外造一层 DTO：少一层映射就少一处会和网页端语义漂移的地方。
 */
@Controller('v1')
@UseGuards(ApiKeyGuard)
export class V1Controller {
  constructor(
    private readonly auth: AuthService,
    private readonly families: FamiliesService,
    private readonly items: ItemsService,
    private readonly locations: LocationsService,
    private readonly activity: ActivityService,
  ) {}

  /** 当前账号（含头像）+ 当前家庭与角色 + 该账号的家庭列表 */
  @Get('me')
  @UseGuards(FamilyContextGuard)
  async me(@CurrentUser() user: AuthUser, @CurrentFamily() family: FamilyContext) {
    const [account, families] = await Promise.all([
      this.auth.profile(user),
      this.families.list(user.id),
    ]);

    return {
      scope: 'read-only',
      account,
      // 当前生效的家庭（由 x-family-id 或默认家庭解析而来）与本次请求的角色
      family: { id: family.id, role: family.role },
      families: families.map((row) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        isPersonal: row.isPersonal,
      })),
    };
  }

  /** 家庭列表 + 详情（币种/语言/时区/成员数/物品数/位置数） */
  @Get('families')
  familiesList(@CurrentUser() user: AuthUser) {
    return this.families.list(user.id);
  }

  /** 位置树（含备注 description、照片 imageUrl 与三种计数） */
  @Get('locations')
  @UseGuards(FamilyContextGuard)
  locationsList(@CurrentFamily() family: FamilyContext) {
    return this.locations.tree(family.id);
  }

  @Get('locations/:id')
  @UseGuards(FamilyContextGuard)
  locationDetail(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.locations.detail(family.id, id);
  }

  /** 物品列表：支持 q / sn / locationId / tagId / page / pageSize（与网页端同一套过滤） */
  @Get('items')
  @UseGuards(FamilyContextGuard)
  itemsList(@CurrentFamily() family: FamilyContext, @Query() query: QueryItemsDto) {
    return this.items.list(family.id, query);
  }

  /** 必须放在 items/:id 之前，否则 history 会被 ParseIntPipe 当成 id */
  @Get('items/:id/history')
  @UseGuards(FamilyContextGuard)
  itemHistory(
    @CurrentFamily() family: FamilyContext,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ActivityQueryDto,
  ) {
    return this.activity.listForItem(family.id, id, query);
  }

  @Get('items/:id')
  @UseGuards(FamilyContextGuard)
  itemDetail(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.items.detail(family.id, id);
  }
}
