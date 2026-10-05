/** 位置树展开状态：跨层级共享（拖拽悬停自动展开、跨页面保留） */
export function useTreeExpansion() {
  const expanded = useState<number[]>('hb-tree-expanded', () => []);

  const isExpanded = (id: number) => expanded.value.includes(id);

  function expand(id: number) {
    if (!expanded.value.includes(id)) expanded.value = [...expanded.value, id];
  }

  function collapse(id: number) {
    expanded.value = expanded.value.filter((row) => row !== id);
  }

  function toggle(id: number) {
    if (isExpanded(id)) collapse(id);
    else expand(id);
  }

  /** 删掉不存在的节点，避免状态越积越多 */
  function prune(validIds: Set<number>) {
    expanded.value = expanded.value.filter((id) => validIds.has(id));
  }

  return { expanded, isExpanded, expand, collapse, toggle, prune };
}
