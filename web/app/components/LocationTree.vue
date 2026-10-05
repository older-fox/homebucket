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
      @end="onEnd"
    >
      <div v-for="node in list" :key="node.id" class="node" :data-id="node.id">
        <div class="node-row" :class="{ selected: node.id === selectedId }" @click="emit('select', node.id)">
          <UIcon name="i-lucide-grip-vertical" class="drag-handle" />

          <button v-if="node.children.length" type="button" class="expand" @click.stop="toggle(node.id)">
            <UIcon :name="open.has(node.id) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" />
          </button>
          <span v-else class="expand placeholder" />

          <span class="name">{{ node.name }}</span>
          <span v-if="node.itemCount" class="badge hb-num">{{ node.itemCount }}</span>

          <UDropdownMenu
            :items="nodeMenu(node)"
            :content="{ align: 'end' }"
            @click.stop
          >
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

        <LocationTree
          v-if="open.has(node.id)"
          class="children"
          :nodes="node.children"
          :parent-id="node.id"
          :selected-id="selectedId"
          @select="emit('select', $event)"
          @move="emit('move', $event)"
          @create-child="emit('createChild', $event)"
          @edit="emit('edit', $event)"
          @remove="emit('remove', $event)"
        />
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

/** 本地副本：拖拽只改本地，真正的落点由服务端裁决后用 tree 整体替换 */
const list = computed({
  get: () => props.nodes,
  set: () => undefined,
});

const open = ref<Set<number>>(new Set());

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
      {
        label: t('location.newChild'),
        icon: 'i-lucide-folder-plus',
        onSelect: () => emit('createChild', node.id),
      },
      {
        label: t('common.edit'),
        icon: 'i-lucide-pencil',
        onSelect: () => emit('edit', node),
      },
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
function onEnd(event: { from: HTMLElement; to: HTMLElement; oldIndex?: number; newIndex?: number; item: HTMLElement }) {
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
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
}

.node-row:hover {
  background: var(--hb-surface-2);
}

.node-row.selected {
  background: color-mix(in srgb, var(--hb-brand) 14%, transparent);
  color: var(--hb-brand);
  font-weight: var(--hb-fw-semibold);
}

.drag-handle {
  width: 16px;
  height: 16px;
  color: var(--hb-muted);
  cursor: grab;
  flex-shrink: 0;
  touch-action: none;
}

.expand {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
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
  border-left: 1px dashed var(--hb-border);
  padding-left: 6px;
}
/* ---------------- 视觉细化 ---------------- */
.node-row {
  position: relative;
  min-height: 38px;
  transition:
    background var(--hb-dur) var(--hb-ease),
    color var(--hb-dur) var(--hb-ease);
}

/* 选中态：左侧品牌色标记条 + 柔和底色 */
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

/* 拖拽把手：平时半透明，悬停/选中时高亮，移动端常显 */
.drag-handle {
  opacity: 0.32;
  transition: opacity var(--hb-dur) var(--hb-ease);
}

.node-row:hover .drag-handle,
.node-row.selected .drag-handle {
  opacity: 0.9;
}

.children {
  border-left: 1px solid var(--hb-border);
}

.badge {
  font-variant-numeric: tabular-nums;
}

@media (pointer: coarse) {
  .node-row {
    min-height: 44px;
  }

  .drag-handle {
    opacity: 0.6;
  }

  .expand {
    width: 28px;
    height: 28px;
  }
}
</style>
