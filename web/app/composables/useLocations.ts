import type { TreeNode } from '~/types/location';

export interface LocationContents {
  location: {
    id: number;
    name: string;
    description: string | null;
    imageUrl: string | null;
    breadcrumb?: { id: number; name: string }[];
  };
  locations: TreeNode[];
  items: {
    id: number;
    name: string;
    quantity: number;
    price: number;
    model: string | null;
    location: { id: number; name: string } | null;
    unitCount: number;
  }[];
  itemUnits: { id: number; sn: string | null; itemId: number; itemName: string; locationName: string | null }[];
}

/**
 * 位置数据缓存（跨页面共享）：
 * - 位置树只在需要时拉一次，返回上一页时直接用缓存渲染，不再出现"空列表等半天"
 * - 每个位置的 contents 按 id 缓存，进入时先用缓存渲染，再后台刷新（SWR）
 */
export function useLocations() {
  const api = useApi();

  const tree = useState<TreeNode[]>('hb-loc-tree', () => []);
  const treeLoaded = useState<boolean>('hb-loc-tree-loaded', () => false);
  const treePending = useState<boolean>('hb-loc-tree-pending', () => false);
  const contentsMap = useState<Record<number, LocationContents>>('hb-loc-contents', () => ({}));
  const pendingIds = useState<Record<number, boolean>>('hb-loc-contents-pending', () => ({}));

  /** 拉取位置树；已有缓存时直接返回（force=true 强制刷新） */
  async function loadTree(force = false): Promise<TreeNode[]> {
    if (treeLoaded.value && !force) return tree.value;

    // 已有内容时后台刷新，避免界面闪空
    const hasCache = tree.value.length > 0;
    if (!hasCache) treePending.value = true;
    try {
      tree.value = await api.get<TreeNode[]>('/locations/tree');
      treeLoaded.value = true;
    } finally {
      treePending.value = false;
    }
    return tree.value;
  }

  /** 拉取某个位置的聚合内容（SWR：有缓存先渲染，再刷新） */
  async function loadContents(id: number, force = false): Promise<LocationContents | null> {
    const cached = contentsMap.value[id];
    if (cached && !force) {
      void refreshContents(id);
      return cached;
    }

    pendingIds.value = { ...pendingIds.value, [id]: true };
    try {
      const data = await api.get<LocationContents>(`/locations/${id}/contents`);
      contentsMap.value = { ...contentsMap.value, [id]: data };
      return data;
    } catch {
      return cached ?? null;
    } finally {
      pendingIds.value = { ...pendingIds.value, [id]: false };
    }
  }

  async function refreshContents(id: number) {
    const data = await api.get<LocationContents>(`/locations/${id}/contents`);
    contentsMap.value = { ...contentsMap.value, [id]: data };
  }

  /** 增删改后让缓存的树失效 */
  function invalidateTree() {
    treeLoaded.value = false;
  }

  /** 某个位置被改动后清掉它的内容缓存 */
  function invalidateContents(id: number) {
    const next = { ...contentsMap.value };
    delete next[id];
    contentsMap.value = next;
  }

  /** 拖拽/增删改会影响多个位置的聚合结果，直接整体失效（下次进入时再拉） */
  function invalidateAllContents() {
    contentsMap.value = {};
  }

  const isContentsPending = (id: number) => pendingIds.value[id] === true;

  return {
    tree,
    treePending,
    treeLoaded,
    contentsMap,
    loadTree,
    loadContents,
    refreshContents,
    invalidateTree,
    invalidateContents,
    invalidateAllContents,
    isContentsPending,
  };
}
