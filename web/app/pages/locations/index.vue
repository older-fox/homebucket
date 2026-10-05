<template>
  <div class="hb-fill">
    <PageHeader :title="t('location.title')" :description="t('location.dragHint')">
      <template #actions>
        <UButton icon="i-lucide-plus" class="hb-tap" @click="dialogs?.openCreate(null)">
          <span class="hide-sm">{{ t('location.new') }}</span>
        </UButton>
      </template>
    </PageHeader>

    <div class="hb-split layout">
      <!-- 位置树：移动端独占整屏，桌面端与右侧详情并排 -->
      <aside class="hb-pane tree-pane">
        <div class="hb-pane-head">
          <UIcon name="i-lucide-list-tree" class="head-icon" />
          <span class="hb-h3">{{ t('location.tree') }}</span>
          <span class="hb-muted hb-num">{{ tree.length }}</span>
        </div>
        <div class="hb-pane-body tree-body">
          <EmptyState v-if="!tree.length" :text="t('location.emptyTree')" icon="i-lucide-map-pinned">
            <UButton size="sm" @click="dialogs?.openCreate(null)">{{ t('location.new') }}</UButton>
          </EmptyState>
          <LocationTree
            v-else
            :key="treeVersion"
            :nodes="tree"
            :selected-id="selectedId"
            @select="onSelect"
            @move="move"
            @create-child="(id: number) => dialogs?.openCreate(id)"
            @edit="(node: TreeNode) => dialogs?.openEdit(node.id)"
            @remove="remove"
          />
        </div>
      </aside>

      <!-- 桌面端：右侧固定详情面板 -->
      <section v-if="!isMobile" class="hb-pane detail-pane">
        <LocationDetail
          v-if="selectedId"
          :key="`${selectedId}-${detailKey}`"
          :id="selectedId"
          @edit="dialogs?.openEdit(selectedId)"
          @create-child="dialogs?.openCreate(selectedId)"
          @qr="dialogs?.openQr(selectedId)"
          @select="select"
        />
        <EmptyState v-else :text="t('location.emptyContent')" icon="i-lucide-mouse-pointer-click" />
      </section>
    </div>

    <LocationDialogs ref="dialogs" @saved="onSaved" @deleted="onDeleted" />
  </div>
</template>

<script setup lang="ts">
import type { MovePayload, TreeNode } from '~/types/location';

// contained：页面不滚动，树/详情各自内部滚动
definePageMeta({ contained: true });

const { t } = useI18n();
const api = useApi();
const route = useRoute();
const toast = useToast();

const tree = ref<TreeNode[]>([]);
const treeVersion = ref(0);
const selectedId = ref<number | null>(null);
const detailKey = ref(0);
const dialogs = ref<{ openCreate: (id: number | null) => void; openEdit: (id: number) => void; openQr: (id: number) => void } | null>(
  null,
);

/** 移动端：树独占整屏，点节点进入独立的位置详情路由 */
const isMobile = ref(false);
onMounted(() => {
  const query = window.matchMedia('(max-width: 767px)');
  const update = () => {
    isMobile.value = query.matches;
  };
  update();
  query.addEventListener('change', update);
  onBeforeUnmount(() => query.removeEventListener('change', update));
});

// ---------------------------------------------------------------- 树工具
const cloneTree = (nodes: TreeNode[]): TreeNode[] =>
  nodes.map((node) => ({ ...node, children: cloneTree(node.children ?? []) }));

function findNode(nodes: TreeNode[], id: number): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children ?? [], id);
    if (found) return found;
  }
  return null;
}

function descendsFrom(node: TreeNode, id: number): boolean {
  if (node.id === id) return true;
  return node.children.some((child) => descendsFrom(child, id));
}

function detach(nodes: TreeNode[], id: number): boolean {
  const index = nodes.findIndex((node) => node.id === id);
  if (index >= 0) {
    nodes.splice(index, 1);
    return true;
  }
  return nodes.some((node) => detach(node.children ?? [], id));
}

function insertAt(nodes: TreeNode[], node: TreeNode, payload: MovePayload): boolean {
  const position = (siblings: TreeNode[]) => {
    if (payload.afterId) {
      const index = siblings.findIndex((row) => row.id === payload.afterId);
      return index >= 0 ? index + 1 : siblings.length;
    }
    if (payload.beforeId) {
      const index = siblings.findIndex((row) => row.id === payload.beforeId);
      return index >= 0 ? index : siblings.length;
    }
    return siblings.length;
  };

  if (payload.parentId === null) {
    nodes.splice(position(nodes), 0, node);
    return true;
  }

  for (const row of nodes) {
    if (row.id === payload.parentId) {
      const children = row.children ?? (row.children = []);
      children.splice(position(children), 0, node);
      return true;
    }
    if (insertAt(row.children ?? [], node, payload)) return true;
  }
  return false;
}

/** 本地乐观移动：立即改本地数据，界面不再等服务器 */
function applyLocalMove(source: TreeNode[], payload: MovePayload): TreeNode[] {
  const next = cloneTree(source);
  const node = findNode(next, payload.id);
  if (!node) return source;

  detach(next, payload.id);
  node.parentId = payload.parentId;
  if (!insertAt(next, node, payload)) return source;
  return next;
}

// ---------------------------------------------------------------- 数据
async function loadTree() {
  tree.value = await api.get<TreeNode[]>('/locations/tree');
  treeVersion.value += 1;
}

function select(id: number | null) {
  selectedId.value = id;
}

function onSelect(id: number) {
  if (isMobile.value) {
    navigateTo(`/locations/${id}`);
    return;
  }
  select(id);
}

/**
 * 拖拽：先本地落地（立刻见效、不闪回），再让服务端裁决；
 * 失败时回滚到拖拽前的快照。
 */
async function move(payload: MovePayload) {
  const node = findNode(tree.value, payload.id);
  if (node && payload.parentId !== null && descendsFrom(node, payload.parentId)) {
    toast.add({ title: t('location.cycleBlocked'), color: 'error' });
    treeVersion.value += 1;
    return;
  }

  const snapshot = cloneTree(tree.value);
  tree.value = applyLocalMove(tree.value, payload);
  treeVersion.value += 1;

  try {
    const result = await api.patch<{ tree: TreeNode[] }>(`/locations/${payload.id}/move`, {
      parentId: payload.parentId,
      beforeId: payload.beforeId ?? undefined,
      afterId: payload.afterId ?? undefined,
    });
    tree.value = result.tree;
    treeVersion.value += 1;
    detailKey.value += 1;
  } catch (error) {
    tree.value = snapshot;
    treeVersion.value += 1;
    toast.add({
      title: t('location.moveFailed'),
      description: (error as { message?: string }).message,
      color: 'error',
    });
  }
}

async function remove(node: TreeNode) {
  if (!window.confirm(t('location.deleteConfirm', { name: node.name }))) return;
  try {
    await api.del(`/locations/${node.id}`);
    if (selectedId.value === node.id) select(null);
    await loadTree();
    toast.add({ title: t('common.deleted'), color: 'success' });
  } catch (error) {
    toast.add({ title: (error as { message?: string }).message ?? t('errors.unknown'), color: 'error' });
  }
}

async function onSaved() {
  await loadTree();
  detailKey.value += 1;
}

async function onDeleted(id: number) {
  if (selectedId.value === id) select(null);
  await loadTree();
  detailKey.value += 1;
}

onMounted(async () => {
  await loadTree();

  // 移动端带 ?focus= 进来时，直接进独立的位置详情路由
  const focus = route.query.focus ? Number(route.query.focus) : null;
  if (focus && isMobile.value) await navigateTo(`/locations/${focus}`, { replace: true });
});
</script>

<style scoped>
.layout {
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;
}

.tree-pane,
.detail-pane {
  min-height: 0;
}

.tree-body {
  padding: 8px;
}

.head-icon {
  width: 17px;
  height: 17px;
  color: var(--hb-brand);
}

/* 移动端：树占满可用高度（footer 仍由外层留白保证不被遮挡） */
@media (max-width: 767px) {
  .layout {
    display: flex;
    flex-direction: column;
  }

  .tree-pane {
    flex: 1 1 auto;
  }

  .hide-sm {
    display: none;
  }
}

@media (min-width: 768px) {
  .layout {
    grid-template-columns: 300px 1fr;
  }
}
</style>
