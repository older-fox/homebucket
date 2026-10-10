/** 与后端 ActivityService 返回结构一致的操作历史条目 */
export interface ActivityChange {
  field: string;
  /** 写入时已解析成可直接展示的值；null 表示新增时无旧值 / 删除时无新值 */
  from: unknown;
  to: unknown;
}

export interface ActivityEntry {
  id: number;
  action: string;
  targetType: 'item' | 'unit' | 'location' | string;
  targetId: number;
  itemId: number | null;
  itemName: string | null;
  actorId: number | null;
  actorName: string;
  changes: ActivityChange[];
  createdAt: string;
}

export interface ActivityPage {
  items: ActivityEntry[];
  total: number;
  page: number;
  pageSize: number;
}
