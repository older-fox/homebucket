<template>
  <div class="tree" :data-parent="parentId ?? 'root'">
    <VueDraggable
      v-model="list"
      :data-parent="parentId ?? 'root'"
      :group="{ name: 'hb-locations' }"
      :animation="120"
      handle=".drag-handle"
      ghost-class="hb-tree-ghost"
      drag-class="hb-tree-drag"
      chosen-class="hb-tree-chosen"
      :fallback-on-body="true"
      :fallback-tolerance="4"
      :touch-start-threshold="4"
      :force-fallback="false"
      @start="onDragStart"
      @move="onDragMove"
      @end="onEnd"
    >
      <div v-for="node in list" :key="node.id" class="node" :data-id="node.id">
        <div
          class="node-row"
          :class="{ selected: node.id === selectedId, 'drop-target': node.id === hoverId }"
          @click="emit('select', node.id)"
        >
          <UIcon name="i-lucide-grip-vertical" class="drag-handle" />

          <button v-if="node.children.length" type="button" class="expand" @click.stop="toggleNode(node.id)">
            <UIcon :name="isExpanded(node.id) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" />
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

        <!-- 层级默认按展开状态显示；拖拽时只展开"悬停停留"的那个节点（Windows 文件拖放逻辑） -->
        <div v-show="isExpanded(node.id)" class="children">
          <LocationTree
            :nodes="node.children"
            :parent-id="node.id"
            :selected-id="selectedId"
            @select="emit('select', $event)"
            @move="emit('move', $event)"
            @create-child="emit('createChild', $event)"
            @edit="emit('edit', $event)"
            @remove="emit('remove', $event)"
            @abort="emit('abort')"
          />
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
  abort: [];
}>();

const { t } = useI18n();
const { isExpanded, expand, toggle: toggleExpansion } = useTreeExpansion();

/** 本地数据由父页面维护（乐观更新），这里只上报落点 */
const list = computed({
  get: () => props.nodes,
  set: () => undefined,
});

/** 当前悬停的节点（拖拽时高亮 + 定时展开） */
const hoverId = ref<number | null>(null);
let hoverTimer: ReturnType<typeof setTimeout> | null = null;

// 默认展开根一层，方便看到结构（不依赖拖拽状态）
onMounted(() => {
  if (!props.parentId) props.nodes.slice(0, 1).forEach((node) => expand(node.id));
});

onBeforeUnmount(clearHover);

function toggleNode(id: number) {
  toggleExpansion(id);
}

function clearHover() {
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = null;
  hoverId.value = null;
}

function onDragStart() {
  clearHover();
}

/**
 * Windows 文件拖放式展开：拖拽中悬停在某个节点上停留片刻，就自动展开它，
 * 从而可以继续往更深层级放；其余层级保持原样，不会被一次性全部展开。
 */
function onDragMove(event: { related?: HTMLElement | null }) {
  const related = event.related as HTMLElement | null | undefined;
  const nodeEl = (related?.closest?.('.node') ?? null) as HTMLElement | null;
  const raw = nodeEl?.dataset?.id;
  const id = raw ? Number(raw) : null;

  if (!id || id === hoverId.value) return;

  clearHover();
  hoverId.value = id;

  hoverTimer = setTimeout(() => {
    expand(id);
    hoverId.value = null;
  }, 520);
}

/**
 * 落点解析：Sortable 的容器是 VueDraggable 渲染的元素（data-parent 挂在它上面），
 * 取不到就用 closest 向上找最近的层级容器；再取不到宁可 abort 也不猜层级。
 */
function onEnd(event: {
  from: HTMLElement;
  to: HTMLElement;
  oldIndex?: number;
  newIndex?: number;
  item: HTMLElement;
}) {
  clearHover();

  const { from, to, oldIndex, newIndex, item } = event;
  if (from === to && oldIndex === newIndex) return;

  const draggedId = Number(item.dataset.id);
  if (!Number.isInteger(draggedId)) {
    emit('abort');
    return;
  }

  const container: HTMLElement = to.closest('[data-parent]') ?? to;
  const parentAttr = container.dataset.parent ?? to.dataset.parent;
  if (parentAttr === undefined || parentAttr === '') {
    emit('abort');
    return;
  }

  const parentId = parentAttr === 'root' ? null : Number(parentAttr);
  if (parentAttr !== 'root' && !Number.isInteger(parentId)) {
    emit('abort');
    return;
  }

  const ids = Array.from(container.children)
    .filter((child) => (child as HTMLElement).dataset?.id)
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

/* 拖拽悬停：显示可容纳的落点 */
.node-row.drop-target {
  background: var(--hb-brand-soft);
  outline: 1px dashed var(--hb-brand);
  outline-offset: -1px;
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

/* 拖拽把手：只在把手区域起拖，且禁止浏览器接管触摸滚动，避免"变成滑页面" */
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
.node-row.selected .drag-handle,
.node-row.drop-target .drag-handle {
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

@media (pointer: coarse) {
  .node-row {
    min-height: 48px;
    padding: 10px 8px;
  }

  /* 触屏：把手做大且常显，触摸滚动被 touch-action:none 挡住，拖拽更稳 */
  .drag-handle {
    opacity: 0.7;
    width: 22px;
    height: 22px;
    padding: 2px;
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
