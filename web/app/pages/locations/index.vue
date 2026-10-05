<template>
  <div class="hb-fill">
    <PageHeader :title="t('location.title')" :description="t('location.dragHint')">
      <template #actions>
        <UButton icon="i-lucide-plus" class="hb-tap" @click="openCreate(null)">
          <span class="hide-sm">{{ t('location.new') }}</span>
        </UButton>
      </template>
    </PageHeader>

    <div class="hb-split layout" :class="{ 'show-detail': selectedId !== null }">
      <!-- 左：位置树（高度与右侧面板一致，内部滚动） -->
      <aside class="hb-pane tree-pane">
        <div class="hb-pane-head">
          <UIcon name="i-lucide-list-tree" class="head-icon" />
          <span class="hb-h3">{{ t('location.tree') }}</span>
          <span class="muted hb-num">{{ tree.length }}</span>
        </div>
        <div class="hb-pane-body tree-body">
          <EmptyState v-if="!tree.length" :text="t('location.emptyTree')" icon="i-lucide-map-pinned">
            <UButton size="sm" @click="openCreate(null)">{{ t('location.new') }}</UButton>
          </EmptyState>
          <LocationTree
            v-else
            :key="treeVersion"
            :nodes="tree"
            :selected-id="selectedId"
            @select="select"
            @move="move"
            @create-child="openCreate"
            @edit="openEdit"
            @remove="remove"
          />
        </div>
      </aside>

      <!-- 右：固定面板，内容再多也在面板内滚动 -->
      <section class="hb-pane detail-pane">
        <div class="hb-pane-head">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            size="sm"
            class="hb-tap back-sm"
            @click="select(null)"
          />
          <div class="head-main">
            <span class="hb-h3">{{ contents?.location.name ?? t('location.title') }}</span>
            <span v-if="crumb" class="muted crumb">{{ crumb }}</span>
          </div>
          <template v-if="selectedId">
            <UButton
              color="neutral"
              variant="soft"
              size="sm"
              icon="i-lucide-qr-code"
              class="hb-tap"
              :aria-label="t('location.qrCode')"
              @click="openQr"
            />
            <UButton size="sm" icon="i-lucide-folder-plus" class="hb-tap" @click="openCreate(selectedId)">
              <span class="hide-sm">{{ t('location.newChild') }}</span>
            </UButton>
          </template>
        </div>

        <div class="hb-pane-body detail-body">
          <EmptyState v-if="!selectedId" :text="t('location.emptyContent')" icon="i-lucide-mouse-pointer-click" />

          <template v-else-if="contents">
            <img v-if="contents.location.imageUrl" :src="contents.location.imageUrl" class="cover" :alt="contents.location.name" />
            <p v-if="contents.location.description" class="muted desc">{{ contents.location.description }}</p>

            <!-- 子位置 -->
            <template v-if="childLocations.length">
              <h3 class="hb-section-title">
                <UIcon name="i-lucide-folder" />
                {{ t('location.subLocations') }}
                <span class="muted hb-num">{{ childLocations.length }}</span>
              </h3>
              <div class="grid">
                <button v-for="child in childLocations" :key="child.id" type="button" class="mini hb-tap" @click="select(child.id)">
                  <UIcon name="i-lucide-folder" />
                  <span class="mini-name">{{ child.name }}</span>
                  <span class="mini-count hb-num">{{ child.itemCount }}</span>
                </button>
              </div>
            </template>

            <!-- 物品（分页） -->
            <h3 class="hb-section-title">
              <UIcon name="i-lucide-package" />
              {{ t('location.directItems') }}
              <span class="muted hb-num">{{ contents.items.length }}</span>
            </h3>
            <EmptyState v-if="!contents.items.length" :text="t('location.emptyContent')" icon="i-lucide-package" />
            <div v-else class="sub-pane">
              <table class="hb-table">
                <thead>
                  <tr>
                    <th>{{ t('item.name') }}</th>
                    <th class="num">{{ t('item.quantity') }}</th>
                    <th>{{ t('item.location') }}</th>
                    <th class="num">{{ t('item.totalPrice') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in pagedItems" :key="item.id" class="clickable" @click="navigateTo(`/items/${item.id}`)">
                    <td class="strong">
                      {{ item.name }}
                      <span v-if="item.unitCount" class="hb-chip tiny hb-num">{{ item.unitCount }} SN</span>
                    </td>
                    <td class="num hb-num">{{ item.quantity }}</td>
                    <td class="muted">{{ item.location?.name || t('item.noLocation') }}</td>
                    <td class="num hb-num">{{ money(item.price * item.quantity) }}</td>
                  </tr>
                </tbody>
              </table>
              <div v-if="contents.items.length > pageSize" class="pager">
                <UButton color="neutral" variant="soft" size="xs" :disabled="itemPage <= 1" @click="itemPage -= 1">
                  {{ t('common.prev') }}
                </UButton>
                <span class="muted hb-num">{{ itemPage }} / {{ Math.ceil(contents.items.length / pageSize) }}</span>
                <UButton
                  color="neutral"
                  variant="soft"
                  size="xs"
                  :disabled="itemPage >= Math.ceil(contents.items.length / pageSize)"
                  @click="itemPage += 1"
                >
                  {{ t('common.next') }}
                </UButton>
              </div>
            </div>

            <!-- 序列号（分页） -->
            <template v-if="contents.itemUnits.length">
              <h3 class="hb-section-title">
                <UIcon name="i-lucide-barcode" />
                {{ t('location.unitsHere') }}
                <span class="muted hb-num">{{ contents.itemUnits.length }}</span>
              </h3>
              <div class="sub-pane">
                <table class="hb-table">
                  <thead>
                    <tr>
                      <th>{{ t('item.sn') }}</th>
                      <th>{{ t('item.name') }}</th>
                      <th>{{ t('item.unitLocation') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="unit in pagedUnits" :key="unit.id" class="clickable" @click="navigateTo(`/items/${unit.itemId}`)">
                      <td class="hb-mono">{{ unit.sn || '—' }}</td>
                      <td>{{ unit.itemName }}</td>
                      <td class="muted">{{ unit.locationName || t('item.noLocation') }}</td>
                    </tr>
                  </tbody>
                </table>
                <div v-if="contents.itemUnits.length > pageSize" class="pager">
                  <UButton color="neutral" variant="soft" size="xs" :disabled="unitPage <= 1" @click="unitPage -= 1">
                    {{ t('common.prev') }}
                  </UButton>
                  <span class="muted hb-num">{{ unitPage }} / {{ Math.ceil(contents.itemUnits.length / pageSize) }}</span>
                  <UButton
                    color="neutral"
                    variant="soft"
                    size="xs"
                    :disabled="unitPage >= Math.ceil(contents.itemUnits.length / pageSize)"
                    @click="unitPage += 1"
                  >
                    {{ t('common.next') }}
                  </UButton>
                </div>
              </div>
            </template>
          </template>
        </div>
      </section>
    </div>

    <!-- 新建 / 编辑位置 -->
    <UModal
      v-model:open="formOpen"
      :title="editing ? t('location.edit') : t('location.new')"
      :fullscreen="isMobile"
      class="fill-modal"
    >
      <template #body>
        <form class="form" @submit.prevent="save">
          <UFormField :label="t('location.name')" required>
            <UInput v-model="form.name" size="xl" class="w-full" required />
          </UFormField>
          <UFormField :label="t('location.parent')">
            <USelect v-model="form.parentId" :items="parentOptions" class="w-full" size="xl" />
          </UFormField>
          <UFormField :label="t('location.description')">
            <UTextarea v-model="form.description" :rows="3" size="xl" class="w-full" />
          </UFormField>
          <UFormField :label="t('location.photo')">
            <PhotoUploader v-model="form.imageIds" :multiple="false" :initial="initialImage" />
          </UFormField>
          <div class="form-actions">
            <UButton type="submit" size="xl" class="hb-tap" :loading="saving">{{ t('common.save') }}</UButton>
            <UButton color="neutral" variant="ghost" size="xl" class="hb-tap" @click="formOpen = false">
              {{ t('common.cancel') }}
            </UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="qrOpen" :title="t('location.qrCode')">
      <template #body>
        <div class="qr-box">
          <img v-if="qrUrl" :src="qrUrl" :alt="t('location.qrCode')" />
          <p v-else class="muted">{{ t('common.loading') }}</p>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { MovePayload, TreeNode } from '~/types/location';

// contained：整页不滚动，树与右侧面板各自内部滚动
definePageMeta({ contained: true });

interface Contents {
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
    location: { id: number; name: string } | null;
    unitCount: number;
  }[];
  itemUnits: { id: number; sn: string | null; itemId: number; itemName: string; locationName: string | null }[];
}

const { t } = useI18n();
const api = useApi();
const route = useRoute();
const toast = useToast();
const { money } = useFormat();

const pageSize = 20;
const tree = ref<TreeNode[]>([]);
const treeVersion = ref(0);
const selectedId = ref<number | null>(route.query.focus ? Number(route.query.focus) : null);
const contents = ref<Contents | null>(null);
const itemPage = ref(1);
const unitPage = ref(1);

const formOpen = ref(false);
const editing = ref<TreeNode | null>(null);
const saving = ref(false);
const initialImage = ref<{ id: number; url: string }[]>([]);
const form = reactive<{ name: string; description: string; parentId: number | undefined; imageIds: number[] }>({
  name: '',
  description: '',
  parentId: undefined,
  imageIds: [],
});

const qrOpen = ref(false);
const qrUrl = ref('');

/** 移动端把弹窗做成全屏，避免“表单不满屏、下面空一大块” */
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

const crumb = computed(() => contents.value?.location.breadcrumb?.map((item) => item.name).join(' / ') ?? '');

const childLocations = computed(() =>
  (contents.value?.locations ?? []).filter((row) => row.id !== selectedId.value),
);

const pagedItems = computed(() => {
  const rows = contents.value?.items ?? [];
  return rows.slice((itemPage.value - 1) * pageSize, itemPage.value * pageSize);
});

const pagedUnits = computed(() => {
  const rows = contents.value?.itemUnits ?? [];
  return rows.slice((unitPage.value - 1) * pageSize, unitPage.value * pageSize);
});

const parentOptions = computed(() => [{ label: t('location.root'), value: -1 }, ...flatten(tree.value)]);

function flatten(nodes: TreeNode[], depth = 0): { label: string; value: number }[] {
  return nodes.flatMap((node) => [
    { label: `${'　'.repeat(depth)}${node.name}`, value: node.id },
    ...flatten(node.children ?? [], depth + 1),
  ]);
}

async function loadTree() {
  tree.value = await api.get<TreeNode[]>('/locations/tree');
}

async function loadContents() {
  if (!selectedId.value) {
    contents.value = null;
    return;
  }
  contents.value = await api.get<Contents>(`/locations/${selectedId.value}/contents`);
  itemPage.value = 1;
  unitPage.value = 1;
}

function select(id: number | null) {
  selectedId.value = id;
  void loadContents();
}

function descendsFrom(node: TreeNode, id: number): boolean {
  if (node.id === id) return true;
  return node.children.some((child) => descendsFrom(child, id));
}

function findNode(nodes: TreeNode[], id: number): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children ?? [], id);
    if (found) return found;
  }
  return null;
}

/** 拖拽：本地先挡闭环，落点交给服务端裁决，用返回的树整体重绘 */
async function move(payload: MovePayload) {
  const node = findNode(tree.value, payload.id);
  if (node && payload.parentId !== null && descendsFrom(node, payload.parentId)) {
    toast.add({ title: t('location.cycleBlocked'), color: 'error' });
    treeVersion.value += 1;
    return;
  }

  try {
    const result = await api.patch<{ tree: TreeNode[] }>(`/locations/${payload.id}/move`, {
      parentId: payload.parentId,
      beforeId: payload.beforeId ?? undefined,
      afterId: payload.afterId ?? undefined,
    });
    tree.value = result.tree;
    treeVersion.value += 1;
    if (selectedId.value) await loadContents();
  } catch (error) {
    toast.add({ title: t('location.moveFailed'), description: (error as { message?: string }).message, color: 'error' });
    await loadTree();
    treeVersion.value += 1;
  }
}

function openCreate(parentId: number | null) {
  editing.value = null;
  Object.assign(form, { name: '', description: '', parentId: parentId ?? undefined, imageIds: [] });
  initialImage.value = [];
  formOpen.value = true;
}

function openEdit(node: TreeNode) {
  editing.value = node;
  Object.assign(form, { name: node.name, description: '', parentId: node.parentId ?? undefined, imageIds: [] });
  initialImage.value = [];
  formOpen.value = true;
}

async function save() {
  saving.value = true;
  try {
    const payload = {
      name: form.name,
      description: form.description || undefined,
      imageId: form.imageIds[0] ?? undefined,
    };
    if (editing.value) {
      await api.patch(`/locations/${editing.value.id}`, payload);
    } else {
      await api.post('/locations', {
        ...payload,
        parentId: form.parentId && form.parentId > 0 ? form.parentId : undefined,
      });
    }
    formOpen.value = false;
    await loadTree();
    treeVersion.value += 1;
    if (selectedId.value) await loadContents();
    toast.add({ title: t('common.saved'), color: 'success' });
  } catch (error) {
    toast.add({ title: (error as { message?: string }).message ?? t('errors.unknown'), color: 'error' });
  } finally {
    saving.value = false;
  }
}

async function remove(node: TreeNode) {
  if (!window.confirm(t('location.deleteConfirm', { name: node.name }))) return;
  try {
    await api.del(`/locations/${node.id}`);
    if (selectedId.value === node.id) select(null);
    await loadTree();
    treeVersion.value += 1;
    toast.add({ title: t('common.deleted'), color: 'success' });
  } catch (error) {
    toast.add({ title: (error as { message?: string }).message ?? t('errors.unknown'), color: 'error' });
  }
}

async function openQr() {
  if (!selectedId.value) return;
  qrOpen.value = true;
  try {
    const svg = await api.request<string>(`/locations/${selectedId.value}/qrcode.svg`, { responseType: 'text' });
    qrUrl.value = URL.createObjectURL(new Blob([svg as unknown as string], { type: 'image/svg+xml' }));
  } catch {
    qrUrl.value = '';
  }
}

onMounted(async () => {
  await loadTree();
  if (selectedId.value) await loadContents();
});
</script>

<style scoped>
.layout {
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;
}

.tree-pane {
  min-height: 0;
}

.tree-body {
  padding: 8px;
}

.detail-pane {
  min-height: 0;
}

.detail-body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.head-icon {
  width: 17px;
  height: 17px;
  color: var(--hb-brand);
}

.head-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.crumb,
.desc {
  font-size: var(--hb-fs-xs);
}

h3.hb-section-title {
  margin: 10px 0 6px;
  font-size: var(--hb-fs-h3);
}

.cover {
  width: 100%;
  max-height: 180px;
  object-fit: cover;
  border-radius: var(--hb-r-md);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}

.mini {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 12px;
  min-height: 40px;
  border: 1px solid var(--hb-border);
  border-radius: var(--hb-r-md);
  background: var(--hb-surface);
  color: var(--hb-text);
  font-size: var(--hb-fs-sm);
  cursor: pointer;
  text-align: left;
}

.mini:hover {
  border-color: var(--hb-border-strong);
  background: var(--hb-surface-2);
}

.mini-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini-count {
  color: var(--hb-muted);
  font-size: var(--hb-fs-xs);
}

/* 表格类内容各占一块，超出在块内滚动 */
.sub-pane {
  border: 1px solid var(--hb-border);
  border-radius: var(--hb-r-md);
  overflow: auto;
  max-height: 42%;
  flex: 0 0 auto;
}

.clickable {
  cursor: pointer;
}

.strong {
  font-weight: var(--hb-fw-medium);
}

.muted {
  color: var(--hb-muted);
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 8px;
  border-top: 1px solid var(--hb-border);
  position: sticky;
  bottom: 0;
  background: var(--hb-surface);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  /* 全屏弹窗下把内容撑开，提交按钮固定在底部 */
  min-height: 100%;
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: 12px;
}

.fill-modal :deep([data-slot='body']) {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.fill-modal .form {
  flex: 1;
}

.qr-box {
  display: flex;
  justify-content: center;
}

.qr-box img {
  width: 240px;
  height: 240px;
}

.back-sm {
  display: inline-flex;
}

/* 移动端：钻取式（树 / 详情二选一） */
@media (max-width: 767px) {
  .show-detail .tree-pane {
    display: none;
  }

  .detail-pane {
    display: none;
  }

  .show-detail .detail-pane {
    display: flex;
  }

  .hide-sm {
    display: none;
  }

  .sub-pane {
    max-height: 50%;
  }
}

@media (min-width: 768px) {
  .layout {
    grid-template-columns: 300px 1fr;
  }

  .back-sm {
    display: none;
  }
}
</style>
