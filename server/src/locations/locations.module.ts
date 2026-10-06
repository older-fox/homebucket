import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, Length } from 'class-validator';
import { CurrentFamily, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import { PrismaService } from '../prisma/prisma.service';
import { shortToken } from '../common/id';

const mediaUrl = (attachment: { key: string; url: string | null } | null | undefined) =>
  attachment ? attachment.url || `/api/media/${attachment.key}` : null;

export class CreateLocationDto {
  @IsString()
  @Length(1, 120)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  parentId?: number;

  @IsOptional()
  @IsInt()
  imageId?: number;
}

export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  imageId?: number;
}

export class MoveLocationDto {
  @IsOptional()
  @IsInt()
  parentId?: number | null;

  @IsOptional()
  @IsInt()
  beforeId?: number | null;

  @IsOptional()
  @IsInt()
  afterId?: number | null;
}

interface LocationRow {
  id: number;
  name: string;
  description: string | null;
  parentId: number | null;
  sortIndex: number;
  imageId: number | null;
  image: { key: string; url: string | null } | null;
  _count: { items: number; children: number; itemUnits: number };
}

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 整棵位置树（嵌套 children），按 sortIndex 升序 */
  async tree(familyId: number) {
    const rows = await this.prisma.location.findMany({
      where: { familyId },
      orderBy: [{ sortIndex: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        parentId: true,
        sortIndex: true,
        imageId: true,
        image: { select: { key: true, url: true } },
        _count: { select: { items: true, children: true, itemUnits: true } },
      },
    });

    const nodes = new Map<number, Record<string, unknown>>();
    for (const row of rows) nodes.set(row.id, this.toNode(row));

    const roots: Record<string, unknown>[] = [];
    for (const row of rows) {
      const node = nodes.get(row.id) as Record<string, unknown>;
      const parent = row.parentId ? nodes.get(row.parentId) : undefined;
      if (parent) (parent.children as Record<string, unknown>[]).push(node);
      else roots.push(node);
    }
    return roots;
  }

  /** 单个位置详情：编辑弹窗靠它回填名称 / 描述 / 父位置 / 图片 */
  async detail(familyId: number, id: number) {
    const location = await this.prisma.location.findFirst({
      where: { id, familyId },
      select: {
        id: true,
        name: true,
        description: true,
        parentId: true,
        imageId: true,
        image: { select: { key: true, url: true } },
      },
    });
    if (!location) throw new NotFoundException({ code: 'location.notFound', message: '位置不存在' });

    const breadcrumb = await this.breadcrumb(familyId, id);
    return { ...location, imageUrl: mediaUrl(location.image), breadcrumb };
  }

  /** 当前位置 + 所有子孙位置里的位置与物品 */
  async contents(familyId: number, id: number) {
    const location = await this.prisma.location.findFirst({
      where: { id, familyId },
      select: {
        id: true,
        name: true,
        description: true,
        parentId: true,
        sortIndex: true,
        imageId: true,
        image: { select: { key: true, url: true } },
      },
    });
    if (!location) throw new NotFoundException({ code: 'location.notFound', message: '位置不存在' });

    const ids = [...(await this.descendantIds(familyId, id, true))];

    const [locations, items, itemUnits] = await Promise.all([
      this.prisma.location.findMany({
        where: { familyId, id: { in: ids } },
        orderBy: [{ sortIndex: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          name: true,
          description: true,
          parentId: true,
          sortIndex: true,
          imageId: true,
          image: { select: { key: true, url: true } },
          _count: { select: { items: true, children: true, itemUnits: true } },
        },
      }),
      this.prisma.item.findMany({
        where: { familyId, locationId: { in: ids } },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          quantity: true,
          price: true,
          model: true,
          location: { select: { id: true, name: true } },
          tags: { select: { id: true, name: true, color: true } },
          _count: { select: { units: true } },
        },
      }),
      this.prisma.itemUnit.findMany({
        where: { familyId, locationId: { in: ids } },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          sn: true,
          itemId: true,
          locationId: true,
          item: { select: { name: true } },
          location: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      location: { ...location, imageUrl: mediaUrl(location.image) },
      locations: locations.map((row) => this.toNode(row)),
      items: items.map((row) => ({ ...row, price: Number(row.price), unitCount: row._count.units })),
      itemUnits: itemUnits.map((row) => ({
        id: row.id,
        sn: row.sn,
        itemId: row.itemId,
        itemName: row.item.name,
        locationId: row.locationId,
        locationName: row.location?.name ?? null,
      })),
    };
  }

  async create(familyId: number, dto: CreateLocationDto) {
    if (dto.parentId) await this.mustExist(familyId, dto.parentId);
    if (dto.imageId) await this.mustAttachment(familyId, dto.imageId);

    const last = await this.prisma.location.findFirst({
      where: { familyId, parentId: dto.parentId ?? null },
      orderBy: { sortIndex: 'desc' },
      select: { sortIndex: true },
    });

    return this.prisma.location.create({
      data: {
        familyId,
        name: dto.name,
        description: dto.description,
        parentId: dto.parentId ?? null,
        imageId: dto.imageId,
        sortIndex: (last?.sortIndex ?? 0) + 1,
        qrToken: shortToken(),
      },
      select: { id: true, name: true, parentId: true },
    });
  }

  async update(familyId: number, id: number, dto: UpdateLocationDto) {
    await this.mustExist(familyId, id);
    if (dto.imageId) await this.mustAttachment(familyId, dto.imageId);
    await this.prisma.location.update({
      where: { id },
      data: { name: dto.name, description: dto.description, imageId: dto.imageId },
    });
    return { ok: true };
  }

  async remove(familyId: number, id: number) {
    await this.mustExist(familyId, id);
    const ids = await this.descendantIds(familyId, id, true);
    await this.prisma.location.delete({ where: { id } });
    return { ok: true, deleted: ids.size };
  }

  /**
   * 拖拽落点由服务端裁决：算出 sortIndex 并做闭环校验。
   * 同级间隔过小时整层量化重排，保证后续拖拽稳定。
   */
  async move(familyId: number, id: number, dto: MoveLocationDto) {
    await this.mustExist(familyId, id);
    const parentId = dto.parentId ?? null;

    if (parentId !== null) {
      if (parentId === id) {
        throw new BadRequestException({ code: 'location.cycle', message: '不能移动到自己的子位置下' });
      }
      await this.mustExist(familyId, parentId);
      const descendants = await this.descendantIds(familyId, id);
      if (descendants.has(parentId)) {
        throw new BadRequestException({ code: 'location.cycle', message: '不能移动到自己的子位置下' });
      }
    }

    const siblings = await this.prisma.location.findMany({
      where: { familyId, parentId },
      orderBy: [{ sortIndex: 'asc' }, { id: 'asc' }],
      select: { id: true, sortIndex: true },
    });
    const others = siblings.filter((row) => row.id !== id);

    let sortIndex: number;
    const indexOf = (target?: number | null) =>
      target ? others.findIndex((row) => row.id === target) : -1;

    const beforeIndex = indexOf(dto.beforeId);
    const afterIndex = indexOf(dto.afterId);

    if (beforeIndex >= 0) {
      const next = others[beforeIndex];
      const prev = others[beforeIndex - 1];
      sortIndex = prev ? (prev.sortIndex + next.sortIndex) / 2 : next.sortIndex - 1;
    } else if (afterIndex >= 0) {
      const prev = others[afterIndex];
      const next = others[afterIndex + 1];
      sortIndex = next ? (prev.sortIndex + next.sortIndex) / 2 : prev.sortIndex + 1;
    } else {
      sortIndex = others.length ? others[others.length - 1].sortIndex + 1 : 0;
    }

    await this.prisma.location.update({ where: { id }, data: { parentId, sortIndex } });
    await this.normalize(familyId, parentId);

    return { ok: true, tree: await this.tree(familyId) };
  }

  // ---------- 内部工具 ----------

  private toNode(row: LocationRow) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      parentId: row.parentId,
      sortIndex: row.sortIndex,
      imageId: row.imageId,
      imageUrl: mediaUrl(row.image),
      itemCount: row._count.items,
      childCount: row._count.children,
      unitCount: row._count.itemUnits,
      children: [] as Record<string, unknown>[],
    };
  }

  /** id 及其所有子孙的 id 集合；withSelf=false 时不包含自身 */
  private async descendantIds(familyId: number, id: number, withSelf = false): Promise<Set<number>> {
    const rows = await this.prisma.location.findMany({
      where: { familyId },
      select: { id: true, parentId: true },
    });
    const childrenOf = new Map<number | null, number[]>();
    for (const row of rows) {
      const list = childrenOf.get(row.parentId) ?? [];
      list.push(row.id);
      childrenOf.set(row.parentId, list);
    }

    const result = new Set<number>();
    const queue = [...(childrenOf.get(id) ?? [])];
    while (queue.length) {
      const current = queue.shift() as number;
      if (result.has(current)) continue;
      result.add(current);
      queue.push(...(childrenOf.get(current) ?? []));
    }
    if (withSelf) result.add(id);
    return result;
  }

  /** 同级 sortIndex 出现相等/间隔过小时整数量化重排 */
  private async normalize(familyId: number, parentId: number | null) {
    const siblings = await this.prisma.location.findMany({
      where: { familyId, parentId },
      orderBy: [{ sortIndex: 'asc' }, { id: 'asc' }],
      select: { id: true, sortIndex: true },
    });

    const needs =
      siblings.length > 1 &&
      siblings.some((row, index) =>
        index === 0 ? false : row.sortIndex - siblings[index - 1].sortIndex < 1e-6,
      );
    if (!needs) return;

    await this.prisma.$transaction(
      siblings.map((row, index) =>
        this.prisma.location.update({ where: { id: row.id }, data: { sortIndex: index + 1 } }),
      ),
    );
  }

  private async breadcrumb(familyId: number, id: number) {
    const rows = await this.prisma.location.findMany({
      where: { familyId },
      select: { id: true, name: true, parentId: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const chain: { id: number; name: string }[] = [];
    let current = byId.get(id);
    let guard = 0;
    while (current && guard < 100) {
      chain.unshift({ id: current.id, name: current.name });
      current = current.parentId ? byId.get(current.parentId) : undefined;
      guard += 1;
    }
    return chain;
  }

  private async mustExist(familyId: number, id: number) {
    const row = await this.prisma.location.findFirst({ where: { id, familyId }, select: { id: true } });
    if (!row) throw new NotFoundException({ code: 'location.notFound', message: '位置不存在' });
    return row;
  }

  private async mustAttachment(familyId: number, id: number) {
    const row = await this.prisma.attachment.findFirst({ where: { id, familyId }, select: { id: true } });
    if (!row) throw new BadRequestException({ code: 'upload.notFound', message: '图片不存在' });
  }
}

@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @FamilyScoped()
  @Get('tree')
  tree(@CurrentFamily() family: FamilyContext) {
    return this.locations.tree(family.id);
  }

  @FamilyScoped()
  @Post()
  create(@CurrentFamily() family: FamilyContext, @Body() dto: CreateLocationDto) {
    return this.locations.create(family.id, dto);
  }

  @FamilyScoped()
  @Get(':id/contents')
  contents(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.locations.contents(family.id, id);
  }

  @FamilyScoped()
  @Get(':id')
  detail(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.locations.detail(family.id, id);
  }

  @FamilyScoped()
  @Patch(':id/move')
  move(
    @CurrentFamily() family: FamilyContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MoveLocationDto,
  ) {
    return this.locations.move(family.id, id, dto);
  }

  @FamilyScoped()
  @Patch(':id')
  update(
    @CurrentFamily() family: FamilyContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locations.update(family.id, id, dto);
  }

  @FamilyScoped()
  @Delete(':id')
  remove(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.locations.remove(family.id, id);
  }
}

@Module({
  controllers: [LocationsController],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
