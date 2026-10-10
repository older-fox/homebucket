import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 把唯一键里的字符串列改成二进制排序规则（utf8mb4_bin）。
 *
 * 为什么必须改：MySQL 建库默认是 utf8mb4_0900_ai_ci —— **不区分大小写也不区分重音**，
 * 而 SQLite 的 UNIQUE 是 BINARY 比较。于是同一个 `A@x.com` / `a@x.com`：
 * MySQL 判为冲突、SQLite 判为两条，同一个应用在两个方言上行为不一致。
 * 统一成二进制后，两边都以「字节完全相同」为准。
 *
 * 为什么用裸 SQL 而不是改实体：TypeORM 的 MysqlDriver.findChangedColumns()
 * 根本不比较 collation（只比类型/长度/精度/默认值/可空/唯一…），所以实体里声明
 * collation 不会被同步，而这里用 ALTER 改完也不会被 schema:log 判成漂移 —— 正好合适。
 * 全新安装则直接由 Init 建表时就带上这个排序规则。
 *
 * ⚠️ 这是破坏性变更：改成二进制后，原来"只在大小写/重音上不同"的数据会撞唯一键。
 * 迁移会**先检查**这类数据，发现就带表名列名报错退出，不会留下半改状态（MySQL 的
 * DDL 隐式提交，中途失败无法回滚，所以宁可提前拦住）。
 */
export class BinaryUniqueCollation1791800000001 implements MigrationInterface {
  name = 'BinaryUniqueCollation1791800000001';

  /** 需要改成二进制排序规则的唯一键：groupBy 是同一个唯一键里的其它列 */
  private static readonly BINARY_UNIQUES: Array<{ table: string; groupBy: string[]; column: string }> = [
    { table: 'User', groupBy: [], column: 'email' },
    { table: 'User', groupBy: [], column: 'username' },
    { table: 'FamilyInvite', groupBy: [], column: 'token' },
    { table: 'Tag', groupBy: ['familyId'], column: 'name' },
    { table: 'Item', groupBy: ['familyId'], column: 'barcode' },
    { table: 'Item', groupBy: ['familyId'], column: 'traceCode' },
    { table: 'Item', groupBy: [], column: 'qrToken' },
    { table: 'ItemUnit', groupBy: ['familyId'], column: 'sn' },
    { table: 'Template', groupBy: ['familyId'], column: 'barcode' },
    { table: 'Location', groupBy: [], column: 'qrToken' },
  ];

  /**
   * MODIFY 必须整列重述，否则 NULL / NOT NULL 会被顺手改掉。
   * 分成 type / nullable 两项是因为 `CHARACTER SET`/`COLLATE` **必须紧跟在类型后面**，
   * 写成 `varchar(191) NULL CHARACTER SET utf8mb4 COLLATE utf8mb4_bin` 是语法错误
   * （真库实测：ER_PARSE_ERROR 1064，报在 'CHARACTER SET utf8mb4 COLLATE utf8mb4_bin' 附近）。
   */
  private static readonly COLUMN_DEF: Record<string, Record<string, { type: string; nullable: boolean }>> = {
    User: {
      email: { type: 'varchar(191)', nullable: true },
      username: { type: 'varchar(191)', nullable: false },
    },
    FamilyInvite: { token: { type: 'varchar(191)', nullable: false } },
    Tag: { name: { type: 'varchar(191)', nullable: false } },
    Item: {
      barcode: { type: 'varchar(191)', nullable: true },
      traceCode: { type: 'varchar(191)', nullable: true },
      qrToken: { type: 'varchar(191)', nullable: false },
    },
    ItemUnit: { sn: { type: 'varchar(191)', nullable: true } },
    Template: { barcode: { type: 'varchar(191)', nullable: true } },
    Location: { qrToken: { type: 'varchar(191)', nullable: false } },
  };

  /** 拼 `MODIFY \`col\` <类型> CHARACTER SET <字符集> COLLATE <排序规则> NULL|NOT NULL`（逗号分隔） */
  private static modifyColumns(
    columns: Record<string, { type: string; nullable: boolean }>,
    charset: string,
    collation: string,
  ): string {
    return Object.entries(columns)
      .map(
        ([column, def]) =>
          `MODIFY \`${column}\` ${def.type} CHARACTER SET ${charset} COLLATE ${collation}` +
          `${def.nullable ? ' NULL' : ' NOT NULL'}`,
      )
      .join(', ');
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 先逐列查现状：MySQL 的 DDL 每条隐式提交，一次迁移可能只改到一半就失败
    // （真库上确实留下过 User/FamilyInvite/Tag 已改、Item/Template/Location 未改的半成品），
    // 所以不能拿某一列当"整迁移已完成"的哨兵，只能逐列比对、只改还不是 utf8mb4_bin 的列。
    const pending = new Map<string, Record<string, { type: string; nullable: boolean }>>();
    for (const [table, columns] of Object.entries(BinaryUniqueCollation1791800000001.COLUMN_DEF)) {
      const names = Object.keys(columns);
      const rows: Array<{ c: string; k: string | null }> = await queryRunner.query(
        `SELECT COLUMN_NAME AS c, COLLATION_NAME AS k FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
           AND COLUMN_NAME IN (${names.map(() => '?').join(', ')})`,
        [table, ...names],
      );
      const actual = new Map(rows.map((row) => [row.c, String(row.k ?? '').toLowerCase()]));
      const rest: Record<string, { type: string; nullable: boolean }> = {};
      for (const name of names) {
        if (actual.get(name) !== 'utf8mb4_bin') rest[name] = columns[name];
      }
      if (Object.keys(rest).length > 0) pending.set(table, rest);
    }
    if (pending.size === 0) return; // 全新库由 Init 建表即带 utf8mb4_bin，或上次已全部改完

    // 所有预检都排在第一条 DDL 之前：MySQL 的 DDL 隐式提交，改到一半撞唯一键是无法回滚的。
    const collisions: string[] = [];
    for (const item of BinaryUniqueCollation1791800000001.BINARY_UNIQUES) {
      if (!pending.get(item.table)?.[item.column]) continue;
      const groups = await this.countBinaryDuplicates(queryRunner, item.table, item.groupBy, item.column);
      if (groups > 0) collisions.push(`${item.table}.${item.column}（${groups} 组）`);
    }
    if (collisions.length > 0) {
      throw new Error(
        `改成二进制排序规则前发现只在大小写/重音上不同的重复值：${collisions.join('、')}。` +
          `这些数据现在会撞唯一键，请先合并或改名，再重跑迁移。`,
      );
    }

    for (const [table, columns] of pending) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ` +
          BinaryUniqueCollation1791800000001.modifyColumns(columns, 'utf8mb4', 'utf8mb4_bin'),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 退回"表默认排序规则"：这些列本来就是不带 collation 建的，跟着表走。
    for (const [table, columns] of Object.entries(BinaryUniqueCollation1791800000001.COLUMN_DEF)) {
      const rows: Array<{ c: string | null }> = await queryRunner.query(
        `SELECT TABLE_COLLATION AS c FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [table],
      );
      const collation = String(rows[0]?.c ?? 'utf8mb4_general_ci');
      const charset = collation.split('_')[0];
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ` +
          BinaryUniqueCollation1791800000001.modifyColumns(columns, charset, collation),
      );
    }
  }

  /** 按二进制比较统计"重复组"数量；NULL 不参与唯一键，直接排除 */
  private async countBinaryDuplicates(
    queryRunner: QueryRunner,
    table: string,
    groupBy: string[],
    column: string,
  ): Promise<number> {
    const keys = [...groupBy, column];
    const group = [...groupBy.map((key) => `\`${key}\``), `\`${column}\` COLLATE utf8mb4_bin`].join(', ');
    const notNull = keys.map((key) => `\`${key}\` IS NOT NULL`).join(' AND ');
    // 刻意不把分组列写进 SELECT：MySQL 5.7+ 默认 sql_mode 含 only_full_group_by，而
    // `col` 与 `col COLLATE utf8mb4_bin` 被视作两个不同表达式，SELECT 裸列会直接报
    // ER_WRONG_FIELD_WITH_GROUP（真实库实测）。改成"每个冲突组返回一行"，行数即组数。
    const rows: Array<{ n: number | string }> = await queryRunner.query(
      `SELECT COUNT(*) AS n FROM \`${table}\` WHERE ${notNull}
       GROUP BY ${group} HAVING COUNT(*) > 1`,
    );
    return rows.length;
  }
}
