import {
  Body,
  ConflictException,
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
import { IsOptional, IsString, Length } from 'class-validator';
import { CurrentFamily, FamilyScoped } from '../common/decorators';
import type { FamilyContext } from '../common/family-context.guard';
import { PrismaService } from '../prisma/prisma.service';

export class CreateTagDto {
  @IsString()
  @Length(1, 40)
  name: string;

  @IsOptional()
  @IsString()
  @Length(4, 9)
  color?: string;
}

export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @Length(1, 40)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(4, 9)
  color?: string;
}

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(familyId: number) {
    const rows = await this.prisma.tag.findMany({
      where: { familyId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, color: true, _count: { select: { items: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      itemCount: row._count.items,
    }));
  }

  async create(familyId: number, dto: CreateTagDto) {
    const exists = await this.prisma.tag.findFirst({
      where: { familyId, name: dto.name },
      select: { id: true },
    });
    if (exists) throw new ConflictException({ code: 'tag.nameTaken', message: '标签名已存在' });

    return this.prisma.tag.create({
      data: { familyId, name: dto.name, color: dto.color },
      select: { id: true, name: true, color: true },
    });
  }

  async update(familyId: number, id: number, dto: UpdateTagDto) {
    await this.mustExist(familyId, id);
    if (dto.name) {
      const exists = await this.prisma.tag.findFirst({
        where: { familyId, name: dto.name, id: { not: id } },
        select: { id: true },
      });
      if (exists) throw new ConflictException({ code: 'tag.nameTaken', message: '标签名已存在' });
    }
    return this.prisma.tag.update({
      where: { id },
      data: { name: dto.name, color: dto.color },
      select: { id: true, name: true, color: true },
    });
  }

  async remove(familyId: number, id: number) {
    await this.mustExist(familyId, id);
    await this.prisma.tag.delete({ where: { id } });
    return { ok: true };
  }

  private async mustExist(familyId: number, id: number) {
    const row = await this.prisma.tag.findFirst({ where: { id, familyId }, select: { id: true } });
    if (!row) throw new NotFoundException({ code: 'tag.notFound', message: '标签不存在' });
  }
}

@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @FamilyScoped()
  @Get()
  list(@CurrentFamily() family: FamilyContext) {
    return this.tags.list(family.id);
  }

  @FamilyScoped()
  @Post()
  create(@CurrentFamily() family: FamilyContext, @Body() dto: CreateTagDto) {
    return this.tags.create(family.id, dto);
  }

  @FamilyScoped()
  @Patch(':id')
  update(
    @CurrentFamily() family: FamilyContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTagDto,
  ) {
    return this.tags.update(family.id, id, dto);
  }

  @FamilyScoped()
  @Delete(':id')
  remove(@CurrentFamily() family: FamilyContext, @Param('id', ParseIntPipe) id: number) {
    return this.tags.remove(family.id, id);
  }
}

@Module({
  controllers: [TagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
