import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, type QueryDeepPartialEntity, type Repository } from 'typeorm';
import { Attachment } from '../entities/attachment.entity';
import { Item } from '../entities/item.entity';
import { ItemUnit } from '../entities/item-unit.entity';
import { Location } from '../entities/location.entity';
import { shortToken } from '../common/id';
import { mediaUrl } from '../common/media';
import { countByForeignKey } from '../common/relation-count';
import type { CreateLocationDto, MoveLocationDto, UpdateLocationDto } from './dto';

/** 位置树节点：对外结构（不是实体），含三种子记录计数与图片地址 */
interface LocationNode {
  id: number;
  name: string;
  description: string | null;
  parentId: number | null;
  sortIndex: number;
  imageId: number | null;
  imageUrl: string | null;
  itemCount: number;
  childCount: number;
  unitCount: number;
  children: LocationNode[];
}

/**
 * 位置域业务逻辑。
 *
 * 数据访问从 Prisma 换成 TypeORM Repository：
 *   · Repository 由 @Global 的 DatabaseModule 统一导出，无需在本模块写 forFeature
 *   · 每个查询都显式映射返回值，因为 TypeORM 的 relations 会加载整行，
 *     不做映射会把实体字段（qrToken/createdAt/...）多吐给前端
 */
@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Location) private readonly locations: Repository<Location>,
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(ItemUnit) private readonly units: Repository<ItemUnit>,
    @InjectRepository(Attachment) private readonly attachments: Repository<Attachment>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** 整棵位置树（嵌套 children），按 sortIndex 升序 */
  async tree(familyId: number) {
    const rows = await this.locations.find({
      where: { familyId },
      order: { sortIndex: 'ASC', id: 'ASC' },
      relations: { image: true },
    });

    const nodes = await this.toNodes(rows);
    const byId = new Map(nodes.map((node) => [node.id, node]));

    const roots: LocationNode[] = [];
    for (const node of nodes) {
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  /** 单个位置详情：编辑弹窗靠它回填名称 / 描述 / 父位置 / 图片 */
  async detail(familyId: number, id: number) {
    const location = await this.locations.findOne({
      where: { id, familyId },
      relations: { image: true },
    });
    if (!location) throw new NotFoundException({ code: 'location.notFound', message: '位置不存在' });

    const breadcrumb = await this.breadcrumb(familyId, id);
    return {
      id: location.id,
      name: location.name,
      description: location.description,
      parentId: location.parentId,
      imageId: location.imageId,
      // 旧接口只 select 了 image 的 key/url，这里显式收窄（TypeORM 会加载整行附件）
      image: location.image ? { key: location.image.key, url: location.image.url } : null,
      imageUrl: mediaUrl(location.image),
      breadcrumb,
    };
  }

  /** 当前位置 + 所有子孙位置里的位置与物品 */
  async contents(familyId: number, id: number) {
    const location = await this.locations.findOne({
      where: { id, familyId },
      relations: { image: true },
    });
    if (!location) throw new NotFoundException({ code: 'location.notFound', message: '位置不存在' });

    const ids = [...(await this.descendantIds(familyId, id, true))];

    const [locationRows, itemRows, unitRows] = await Promise.all([
      this.locations.find({
        where: { familyId, id: In(ids) },
        order: { sortIndex: 'ASC', id: 'ASC' },
        relations: { image: true },
      }),
      this.items.find({
        where: { familyId, locationId: In(ids) },
        order: { name: 'ASC' },
        relations: { location: true, tags: true },
      }),
      this.units.find({
        where: { familyId, locationId: In(ids) },
        order: { id: 'ASC' },
        relations: { item: true, location: true },
      }),
    ]);

    // 原先由 `_count: { select: { units: true } }` 提供；TypeORM 1.x 删了
    // loadRelationCountAndMap，改用一次 GROUP BY 聚合（见 common/relation-count.ts）
    const unitCounts = await countByForeignKey(this.units, 'itemId', itemRows.map((row) => row.id));
    const nodes = await this.toNodes(locationRows);

    return {
      location: {
        id: location.id,
        name: location.name,
        description: location.description,
        parentId: location.parentId,
        sortIndex: location.sortIndex,
        imageId: location.imageId,
        image: location.image ? { key: location.image.key, url: location.image.url } : null,
        imageUrl: mediaUrl(location.image),
      },
      locations: nodes,
      items: itemRows.map((row) => ({
        id: row.id,
        name: row.name,
        quantity: row.quantity,
        price: row.price,
        model: row.model,
        location: row.location ? { id: row.location.id, name: row.location.name } : null,
        tags: row.tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color })),
        unitCount: unitCounts.get(row.id) ?? 0,
      })),
      itemUnits: unitRows.map((row) => ({
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

    // ⚠️ 地雷（brief §3.1）：Prisma 会把 parentId: null 当成"等于 null"，
    // 而 TypeORM 1.x 的 invalidWhereValuesBehavior 默认 "throw"，
    // where 里出现 null 会直接抛 TypeORMError —— 无父节点时必须显式 IsNull()
    const last = await this.locations.findOne({
      where: { familyId, parentId: dto.parentId ?? IsNull() },
      order: { sortIndex: 'DESC' },
      select: { id: true, sortIndex: true },
    });

    const created = await this.locations.save(
      this.locations.create({
        familyId,
        name: dto.name,
        description: dto.description ?? null,
        parentId: dto.parentId ?? null,
        imageId: dto.imageId ?? null,
        sortIndex: (last?.sortIndex ?? 0) + 1,
        qrToken: shortToken(),
      }),
    );

    return { id: created.id, name: created.name, parentId: created.parentId };
  }

  async update(familyId: number, id: number, dto: UpdateLocationDto) {
    await this.mustExist(familyId, id);
    if (dto.imageId) await this.mustAttachment(familyId, dto.imageId);

    // 只覆盖 dto 里出现过的字段（Prisma 的 undefined = 不改，这里保持一致）
    const patch: QueryDeepPartialEntity<Location> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.imageId !== undefined) patch.imageId = dto.imageId;
    if (Object.keys(patch).length) await this.locations.update({ id }, patch);

    // updatedAt 由 @UpdateDateColumn 自动维护
    return { ok: true };
  }

  async remove(familyId: number, id: number) {
    await this.mustExist(familyId, id);
    // 子树由数据库的 ON DELETE CASCADE 带走（与改造前一致），deleted 只是回显数量
    const ids = await this.descendantIds(familyId, id, true);
    await this.locations.delete({ id });
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

    // 同样是地雷点：parentId 为 null 时要用 IsNull()，不能直接写 null
    const siblings = await this.locations.find({
      where: { familyId, parentId: parentId ?? IsNull() },
      order: { sortIndex: 'ASC', id: 'ASC' },
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

    await this.locations.update({ id }, { parentId, sortIndex });
    await this.normalize(familyId, parentId);

    return { ok: true, tree: await this.tree(familyId) };
  }

  // ---------- 内部工具 ----------

  /**
   * 把位置行加工成对外节点。
   *
   * 三种计数原先由 Prisma 的 `_count` 一次带回；TypeORM 1.x 已删除
   * loadRelationCountAndMap（brief §3.2），所以对 Item / Location / ItemUnit
   * 三个子表各做一次 GROUP BY 聚合，避免退化成 N+1。
   */
  private async toNodes(rows: Location[]): Promise<LocationNode[]> {
    const ids = rows.map((row) => row.id);
    const [itemCounts, childCounts, unitCounts] = await Promise.all([
      countByForeignKey(this.items, 'locationId', ids),
      countByForeignKey(this.locations, 'parentId', ids),
      countByForeignKey(this.units, 'locationId', ids),
    ]);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      parentId: row.parentId,
      sortIndex: row.sortIndex,
      imageId: row.imageId,
      imageUrl: mediaUrl(row.image),
      itemCount: itemCounts.get(row.id) ?? 0,
      childCount: childCounts.get(row.id) ?? 0,
      unitCount: unitCounts.get(row.id) ?? 0,
      children: [] as LocationNode[],
    }));
  }

  /** id 及其所有子孙的 id 集合；withSelf=false 时不包含自身 */
  private async descendantIds(familyId: number, id: number, withSelf = false): Promise<Set<number>> {
    const rows = await this.locations.find({
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
    const siblings = await this.locations.find({
      where: { familyId, parentId: parentId ?? IsNull() },
      order: { sortIndex: 'ASC', id: 'ASC' },
      select: { id: true, sortIndex: true },
    });

    const needs =
      siblings.length > 1 &&
      siblings.some((row, index) =>
        index === 0 ? false : row.sortIndex - siblings[index - 1].sortIndex < 1e-6,
      );
    if (!needs) return;

    // 重排放在同一个事务里，中途失败不会留下半层错乱的 sortIndex
    await this.dataSource.transaction(async (manager) => {
      for (const [index, row] of siblings.entries()) {
        await manager.update(Location, { id: row.id }, { sortIndex: index + 1 });
      }
    });
  }

  private async breadcrumb(familyId: number, id: number) {
    const rows = await this.locations.find({
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
    const row = await this.locations.findOne({ where: { id, familyId }, select: { id: true } });
    if (!row) throw new NotFoundException({ code: 'location.notFound', message: '位置不存在' });
    return row;
  }

  private async mustAttachment(familyId: number, id: number) {
    const exists = await this.attachments.exists({ where: { id, familyId } });
    if (!exists) throw new BadRequestException({ code: 'upload.notFound', message: '图片不存在' });
  }
}
