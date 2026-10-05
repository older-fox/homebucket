/** 位置树节点（与后端 /locations/tree、/locations/:id/contents 保持一致） */
export interface TreeNode {
  id: number;
  name: string;
  description?: string | null;
  parentId: number | null;
  sortIndex?: number;
  imageId?: number | null;
  imageUrl?: string | null;
  itemCount: number;
  childCount: number;
  unitCount?: number;
  children: TreeNode[];
}

/** 拖拽落点：前端只描述落点，sortIndex 由服务端裁决 */
export interface MovePayload {
  id: number;
  parentId: number | null;
  beforeId?: number | null;
  afterId?: number | null;
}
