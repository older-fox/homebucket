import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { CurrentFamily, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(familyId: number) {
    const [family, itemCount, locationCount, tagCount, priceRows, recentItems, locations, tags] =
      await Promise.all([
        this.prisma.family.findUnique({
          where: { id: familyId },
          select: { name: true, currency: true, locale: true, timeZone: true },
        }),
        this.prisma.item.count({ where: { familyId } }),
        this.prisma.location.count({ where: { familyId } }),
        this.prisma.tag.count({ where: { familyId } }),
        this.prisma.item.findMany({ where: { familyId }, select: { price: true, quantity: true } }),
        this.prisma.item.findMany({
          where: { familyId },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            id: true,
            name: true,
            quantity: true,
            price: true,
            createdAt: true,
            location: { select: { id: true, name: true } },
            tags: { select: { id: true, name: true, color: true } },
            _count: { select: { units: true } },
          },
        }),
        this.prisma.location.findMany({
          where: { familyId },
          orderBy: [{ sortIndex: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            name: true,
            parentId: true,
            _count: { select: { items: true, children: true } },
          },
        }),
        this.prisma.tag.findMany({
          where: { familyId },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, color: true, _count: { select: { items: true } } },
        }),
      ]);

    const totalValue = priceRows.reduce((sum, row) => sum + Number(row.price) * row.quantity, 0);

    return {
      family,
      counts: {
        items: itemCount,
        locations: locationCount,
        tags: tagCount,
      },
      totalValue: Number(totalValue.toFixed(2)),
      recentItems: recentItems.map((item) => ({
        ...item,
        price: Number(item.price),
        unitCount: item._count.units,
      })),
      locations: locations.map((location) => ({
        id: location.id,
        name: location.name,
        parentId: location.parentId,
        itemCount: location._count.items,
        childCount: location._count.children,
      })),
      tags: tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        itemCount: tag._count.items,
      })),
    };
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @FamilyScoped()
  @Get()
  summary(@CurrentFamily() family: FamilyContext) {
    return this.dashboard.summary(family.id);
  }
}

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
