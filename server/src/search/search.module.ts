import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { CurrentFamily, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import { PrismaService } from '../prisma/prisma.service';

const mediaUrl = (key: string) => `/api/media/${key}`;

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(familyId: number, rawQuery: string) {
    const q = (rawQuery ?? '').trim();
    if (!q) return { query: q, items: [], locations: [], tags: [], units: [] };

    const [items, locations, tags, units] = await Promise.all([
      this.prisma.item.findMany({
        where: {
          familyId,
          OR: [
            { name: { contains: q } },
            { model: { contains: q } },
            { manufacturer: { contains: q } },
            { description: { contains: q } },
          ],
        },
        take: 20,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          quantity: true,
          price: true,
          model: true,
          manufacturer: true,
          location: { select: { id: true, name: true } },
          tags: { select: { id: true, name: true, color: true } },
        },
      }),
      this.prisma.location.findMany({
        where: { familyId, OR: [{ name: { contains: q } }, { description: { contains: q } }] },
        take: 20,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          parentId: true,
          image: { select: { key: true } },
          _count: { select: { items: true, children: true } },
        },
      }),
      this.prisma.tag.findMany({
        where: { familyId, name: { contains: q } },
        take: 20,
        orderBy: { name: 'asc' },
        select: { id: true, name: true, color: true, _count: { select: { items: true } } },
      }),
      this.prisma.itemUnit.findMany({
        where: { familyId, sn: { contains: q } },
        take: 20,
        select: {
          id: true,
          sn: true,
          itemId: true,
          item: { select: { name: true } },
          location: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      query: q,
      items: items.map((item) => ({ ...item, price: Number(item.price) })),
      locations: locations.map((location) => ({
        id: location.id,
        name: location.name,
        parentId: location.parentId,
        itemCount: location._count.items,
        childCount: location._count.children,
        imageUrl: location.image ? mediaUrl(location.image.key) : null,
      })),
      tags: tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        itemCount: tag._count.items,
      })),
      units,
    };
  }
}

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @FamilyScoped()
  @Get()
  run(@CurrentFamily() family: FamilyContext, @Query('q') q: string) {
    return this.search.search(family.id, q);
  }
}

@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
