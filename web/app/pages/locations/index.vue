<template>
  <div>
    <PageHeader :title="t('location.title')" :description="t('location.dragHint')">
      <template #actions>
        <UButton icon="i-lucide-plus" class="hb-tap" @click="openCreate(null)">
          <span class="hide-sm">{{ t('location.new') }}</span>
        </UButton>
      </template>
    </PageHeader>

    <div class="layout" :class="{ 'show-detail': isMobileDetail }">
      <!-- 移动端详情视图的返回条 -->
      <div v-if="isMobileDetail" class="mobile-back">
        <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" @click="select(null)">
          {{ t('location.tree') }}
        </UButton>
      </div>

      <aside class="tree-pane hb-card" :class="{ 'mobile-hidden': isMobileDetail }">
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
      </aside>

      <section class="detail hb-card">
        <EmptyState v-if="!selectedId" :text="t('location.emptyContent')" icon="i-lucide-mouse-pointer-click" />

        <template v-else-if="contents">
          <header class="detail-head">
            <div class="head-main">
              <h2>{{ contents.location.name }}</h2>
              <p v-if="contents.location.breadcrumb?.length" class="crumb">
                {{ contents.location.breadcrumb.map((item) => item.name).join(' / ') }}
              </p>
              <p v-if="contents.location.description" class="desc">{{ contents.location.description }}</p>
            </div>
            <div class="head-actions">
              <UButton color="neutral" variant="soft" icon="i-lucide-qr-code" size="sm" class="hb-tap" @click="openQr">
                {{ t('common.more') }}
              </UButton>
              <UButton size="sm" icon="i-lucide-folder-plus" class="hb-tap" @click="openCreate(selectedId)">
                {{ t('location.newChild') }}
              </UButton>
            </div>
          </header>

          <img v-if="contents.location.imageUrl" :src="contents.location.imageUrl" class="cover" :alt="contents.location.name" />

          <h3 v-if="contents.locations.length > 1">{{ t('location.subLocations') }}</h3>
          <div v-if="contents.locations.length > 1" class="grid">
            <button
              v-for="child in contents.locations.filter((row) => row.id !== selectedId)"
              :key="child.id"
              type="button"
              class="mini hb-tap"
              @click="select(child.id)"
            >
              <UIcon name="i-lucide-folder" />
              <span class="mini-name">{{ child.name }}</span>
              <span class="mini-count hb-num">{{ child.itemCount }}</span>
            </button>
          </div>

          <h3>{{ t('location.directItems') }}</h3>
          <EmptyState v-if="!contents.items.length" :text="t('location.emptyContent')" icon="i-lucide-package" />
          <ul v-else class="rows">
            <li v-for="item in contents.items" :key="item.id" class="row" @click="navigateTo(`/items/${item.id}`)">
              <div class="row-main">
                <span class="row-title">{{ item.name }}</span>
                <span class="row-sub">
                  {{ item.location?.name || t('item.noLocation') }}
                  <template v-if="item.unitCount"> · {{ t('item.unitCount', { count: item.unitCount }) }}</template>
                </span>
              </div>
              <span class="qty hb-num">×{{ item.quantity }}</span>
            </li>
          </ul>

          <template v-if="contents.itemUnits.length">
            <h3>{{ t('location.unitsHere') }}</h3>
            <ul class="rows">
              <li v-for="unit in contents.itemUnits" :key="unit.id" class="row" @click="navigateTo(`/items/${unit.itemId}`)">
                <div class="row-main">
                  <span class="row-title">{{ unit.sn || '—' }}</span>
                  <span class="row-sub">{{ unit.itemName }} · {{ unit.locationName || t('item.noLocation') }}</span>
                </div>
                <UIcon name="i-lucide-chevron-right" class="chev" />
              </li>
            </ul>
          </template>
        </template>
      </section>
    </div>

    <!-- 新建 / 编辑 -->
    <UModal v-model:open="formOpen" :title="editing ? t('location.edit') : t('location.new')">
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
    location: { id: number; name: string } | null;
    unitCount: number;
  }[];
  itemUnits: { id: number; sn: string | null; itemId: number; itemName: string; locationName: string | null }[];
}

const { t } = useI18n();
const api = useApi();
const route = useRoute();
const toast = useToast();

const tree = ref<TreeNode[]>([]);
const treeVersion = ref(0);
const selectedId = ref<number | null>(route.query.focus ? Number(route.query.focus) : null);
const contents = ref<Contents | null>(null);

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

const isMobileDetail = computed(() => selectedId.value !== null);

const parentOptions = computed(() => [
  { label: t('location.root'), value: -1 },
  ...flatten(tree.value),
]);

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

/** 拖拽：本地先挡掉「拖进自己子孙」，再把落点交给服务端裁决，用返回的树整体重绘 */
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
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
  align-items: start;
}

.tree-pane {
  padding: 10px;
  max-height: 62vh;
  overflow: auto;
}

.detail {
  padding: 16px;
  min-height: 220px;
}

.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

h2 {
  margin: 0;
  font-size: var(--hb-fs-h2);
}

.crumb {
  margin: 4px 0 0;
  font-size: var(--hb-fs-xs);
  color: var(--hb-muted);
}

.desc {
  margin: 6px 0 0;
  font-size: var(--hb-fs-sm);
  color: var(--hb-text-2);
}

.head-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

h3 {
  margin: 18px 0 8px;
  font-size: var(--hb-fs-body);
  font-weight: var(--hb-fw-semibold);
  color: var(--hb-text-2);
}

.cover {
  width: 100%;
  max-height: 200px;
  object-fit: cover;
  border-radius: 10px;
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
  padding: 10px 12px;
  min-height: 44px;
  border: 1px solid var(--hb-border);
  border-radius: 10px;
  background: var(--hb-surface);
  font-size: var(--hb-fs-sm);
  cursor: pointer;
  text-align: left;
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

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 4px;
  border-bottom: 1px solid var(--hb-border);
  cursor: pointer;
}

.row-main {
  flex: 1;
  min-width: 0;
}

.row-title {
  display: block;
  font-size: var(--hb-fs-body);
  font-weight: var(--hb-fw-medium);
}

.row-sub {
  display: block;
  margin-top: 2px;
  font-size: var(--hb-fs-xs);
  color: var(--hb-muted);
}

.qty {
  font-size: var(--hb-fs-sm);
  color: var(--hb-text-2);
}

.chev {
  width: 16px;
  height: 16px;
  color: var(--hb-muted);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-actions {
  display: flex;
  gap: 8px;
}

.qr-box {
  display: flex;
  justify-content: center;
}

.qr-box img {
  width: 240px;
  height: 240px;
}

.muted {
  color: var(--hb-muted);
}

.mobile-back {
  margin-bottom: 8px;
}

/* 移动端：钻取式（树 / 详情二选一） */
@media (max-width: 767px) {
  .mobile-hidden {
    display: none;
  }

  .detail {
    display: none;
  }

  .show-detail .detail {
    display: block;
  }
}

@media (min-width: 768px) {
  .layout {
    grid-template-columns: 300px 1fr;
  }

  .tree-pane {
    position: sticky;
    top: 72px;
    max-height: calc(100vh - 120px);
  }

  .hide-sm {
    display: inline;
  }

  .mobile-back {
    display: none;
  }
}

@media (max-width: 767px) {
  .hide-sm {
    display: none;
  }
}
</style>
