<template>
  <div class="tree" :data-parent="parentId ?? 'root'">
    <VueDraggable
      v-model="list"
      :group="{ name: 'hb-locations' }"
      :animation="150"
      handle=".drag-handle"
      ghost-class="hb-tree-ghost"
      drag-class="hb-tree-drag"
      :fallback-on-body="true"
      :delay="160"
      :delay-on-touch-only="true"
      :touch-start-threshold="6"
      @choose="dragging = true"
      @start="dragging = true"
      @end="onEnd"
    >
      <div v-for="node in list" :key="node.id" class="node" :data-id="node.id">
        <div class="node-row" :class="{ selected: node.id === selectedId }" @click="emit('select', node.id)">
          <UIcon name="i-lucide-grip-vertical" class="drag-handle" />

          <button v-if="node.children.length || dragging" type="button" class="expand" @click.stop="toggle(node.id)">
            <UIcon :name="open.has(node.id) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" />
          </button>
          <span v-else class="expand placeholder" />

          <span class="name">{{ node.name }}</span>
          <span v-if="node.itemCount" class="badge hb-num">{{ node.itemCount }}</span>

          <UDropdownMenu :items="nodeMenu(node)" :content="{ align: 'end' }" @click.stop>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-ellipsis-vertical"
              size="xs"
              :aria-label="t('common.more')"
              @click.stop
            />
          </UDropdownMenu>
        </div>

        <!-- 子层级：拖拽时全部展开，空节点也能作为落点（支持任意层级调整） -->
        <div v-show="open.has(node.id) || dragging" class="children">
          <LocationTree
            :nodes="node.children"
            :parent-id="node.id"
            :selected-id="selectedId"
            @select="emit('select', $event)"
            @move="emit('move', $event)"
            @create-child="emit('createChild', $event)"
            @edit="emit('edit', $event)"
            @remove="emit('remove', $event)"
          />
          <p v-if="dragging && !node.children.length" class="drop-hint">{{ t('location.dropHere') }}</p>
        </div>
      </div>
    </VueDraggable>
  </div>
</template>

<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus';
import type { MovePayload, TreeNode } from '~/types/location';

const props = defineProps<{
  nodes: TreeNode[];
  parentId?: number | null;
  selectedId?: number | null;
}>();

const emit = defineEmits<{
  select: [number];
  move: [MovePayload];
  createChild: [number];
  edit: [TreeNode];
  remove: [TreeNode];
}>();

const { t } = useI18n();

/** 本地数据由父页面统一维护（乐观更新），这里只负责把落点告诉父页面 */
const list = computed({
  get: () => props.nodes,
  set: () => undefined,
});

const open = ref<Set<number>>(new Set());
const dragging = ref(false);

// 默认展开第一层，方便看到结构
watch(
  () => props.nodes,
  (nodes) => {
    if (!props.parentId && open.value.size === 0) {
      open.value = new Set(nodes.map((node) => node.id));
    }
  },
  { immediate: true },
);

function toggle(id: number) {
  const next = new Set(open.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  open.value = next;
}

function nodeMenu(node: TreeNode) {
  return [
    [
      { label: t('location.newChild'), icon: 'i-lucide-folder-plus', onSelect: () => emit('createChild', node.id) },
      { label: t('common.edit'), icon: 'i-lucide-pencil', onSelect: () => emit('edit', node) },
    ],
    [
      {
        label: t('common.delete'),
        icon: 'i-lucide-trash-2',
        color: 'error' as const,
        onSelect: () => emit('remove', node),
      },
    ],
  ];
}

/**
 * 落点解析：SortableJS 的 end 事件里，evt.to 是落点所在的列表容器
 * （嵌套列表都带 data-parent，列表项都带 data-id），据此算出 parentId 与前后邻居。
 */
function onEnd(event: {
  from: HTMLElement;
  to: HTMLElement;
  oldIndex?: number;
  newIndex?: number;
  item: HTMLElement;
}) {
  dragging.value = false;

  const { from, to, oldIndex, newIndex, item } = event;
  if (from === to && oldIndex === newIndex) return;

  const draggedId = Number(item.dataset.id);
  if (!Number.isInteger(draggedId)) return;

  const parentAttr = to.dataset.parent;
  const parentId = !parentAttr || parentAttr === 'root' ? null : Number(parentAttr);

  const ids = Array.from(to.children)
    .filter((child) => (child as HTMLElement).dataset.id)
    .map((child) => Number((child as HTMLElement).dataset.id));

  const index = newIndex == null ? ids.length - 1 : newIndex;
  const previous = index > 0 ? ids[index - 1] : null;
  const next = index < ids.length - 1 ? ids[index + 1] : null;

  emit('move', {
    id: draggedId,
    parentId,
    afterId: previous,
    beforeId: previous == null ? next : null,
  });
}
</script>

<style scoped>
.tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 8px;
}

.node {
  display: flex;
  flex-direction: column;
}

.node-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  min-height: 38px;
  transition:
    background var(--hb-dur) var(--hb-ease),
    color var(--hb-dur) var(--hb-ease);
}

.node-row:hover {
  background: var(--hb-surface-2);
}

.node-row.selected {
  background: var(--hb-brand-soft);
  color: var(--hb-brand);
  font-weight: var(--hb-fw-semibold);
}

.node-row.selected::before {
  content: '';
  position: absolute;
  left: -6px;
  top: 50%;
  width: 3px;
  height: 20px;
  border-radius: var(--hb-r-full);
  background: var(--hb-brand);
  transform: translateY(-50%);
}

.drag-handle {
  width: 16px;
  height: 16px;
  color: var(--hb-muted);
  cursor: grab;
  flex-shrink: 0;
  touch-action: none;
  opacity: 0.35;
  transition: opacity var(--hb-dur) var(--hb-ease);
}

.node-row:hover .drag-handle,
.node-row.selected .drag-handle {
  opacity: 0.9;
}

.expand {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: none;
  color: var(--hb-muted);
  flex-shrink: 0;
}

.expand.placeholder {
  display: inline-block;
  width: 20px;
}

.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--hb-fs-body);
}

.badge {
  padding: 0 6px;
  border-radius: 6px;
  background: var(--hb-brand-soft);
  color: var(--hb-brand);
  font-size: var(--hb-fs-xs);
}

.children {
  margin-left: 18px;
  border-left: 1px solid var(--hb-border);
  padding-left: 6px;
}

.drop-hint {
  margin: 2px 0 4px;
  padding: 6px 8px;
  border: 1px dashed var(--hb-border-strong);
  border-radius: var(--hb-r-sm);
  color: var(--hb-muted);
  font-size: var(--hb-fs-xs);
}

@media (pointer: coarse) {
  .node-row {
    min-height: 48px;
    padding: 10px 8px;
  }

  .drag-handle {
    opacity: 0.6;
    width: 18px;
    height: 18px;
  }

  .expand {
    width: 28px;
    height: 28px;
  }

  .name {
    font-size: var(--hb-fs-h3);
  }
}
</style>
