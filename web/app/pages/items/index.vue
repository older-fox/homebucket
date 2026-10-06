<template>
  <div class="hb-fill">
    <PageHeader :title="t('item.title')">
      <template #actions>
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-download"
          class="hb-tap"
          :loading="exporting"
          @click="exportCsv"
        >
          <span class="hide-sm">{{ t('item.exportCsv') }}</span>
        </UButton>
        <UButton icon="i-lucide-plus" class="hb-tap" @click="navigateTo('/items/new')">
          <span class="hide-sm">{{ t('item.new') }}</span>
        </UButton>
      </template>
    </PageHeader>

    <!-- 桌面工具条（移动端改用 SearchBox，见下） -->
    <div class="hb-toolbar desktop-only">
      <UInput
        v-model="filters.q"
        :placeholder="t('item.searchPlaceholderAll')"
        icon="i-lucide-search"
        size="lg"
        class="hb-toolbar-grow"
        type="text"
        inputmode="search"
        enterkeyhint="search"
        @keyup.enter="applyFilters"
      />
      <UButton size="lg" class="hb-tap" @click="applyFilters">{{ t('common.search') }}</UButton>
      <!-- 从主页/搜索页的标签书签进来时，显示当前标签筛选，可一键清除 -->
      <UButton
        v-if="filters.tagId"
        color="neutral"
        variant="soft"
        size="lg"
        icon="i-lucide-tag"
        trailing-icon="i-lucide-x"
        class="hb-tap"
        @click="clearTagFilter"
      >
        {{ t('item.tags') }}
      </UButton>
      <UButton v-if="hasFilters" color="neutral" variant="ghost" size="lg" icon="i-lucide-x" class="hb-tap" @click="clearFilters">
        {{ t('common.all') }}
      </UButton>
    </div>

    <!-- 桌面：固定面板，内容在面板内滚动 -->
    <div v-if="!isMobile" class="hb-pane desktop-only">
      <div class="hb-pane-body">
        <div v-if="pending" class="pad">
          <ListSkeleton :rows="8" :line-height="38" />
        </div>

        <EmptyState v-else-if="!items.length" :text="t('item.empty')" icon="i-lucide-package">
          <UButton size="sm" @click="navigateTo('/items/new')">{{ t('item.new') }}</UButton>
        </EmptyState>

        <table v-else class="hb-table table-desktop">
          <thead>
            <tr>
              <th>{{ t('item.name') }}</th>
              <th>{{ t('item.barcode') }}</th>
              <th class="num">{{ t('item.quantity') }}</th>
              <th>{{ t('item.model') }}</th>
              <th>{{ t('item.location') }}</th>
              <th>{{ t('item.tags') }}</th>
              <th class="num">{{ t('item.totalPrice') }}</th>
              <th class="ops-col" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id" class="clickable" @click="navigateTo(`/items/${item.id}`)">
              <td class="strong">
                {{ item.name }}
                <span v-if="item.unitCount" class="hb-chip tiny hb-num">{{ item.unitCount }} SN</span>
              </td>
              <td class="hb-mono muted">{{ item.barcode || item.traceCode || '—' }}</td>
              <td class="num hb-num">{{ item.quantity }}</td>
              <td>{{ item.model || '—' }}</td>
              <td>{{ item.location?.name || t('item.noLocation') }}</td>
              <td>
                <span
                  v-for="tag in item.tags.slice(0, 3)"
                  :key="tag.id"
                  class="hb-tag"
                  :style="{ color: tag.color }"
                >
                  {{ tag.name }}
                </span>
                <span v-if="item.tags.length > 3" class="muted">+{{ item.tags.length - 3 }}</span>
              </td>
              <td class="num hb-num">{{ money(item.price * item.quantity) }}</td>
              <td class="ops-col">
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-trash-2"
                  :aria-label="t('common.delete')"
                  @click.stop="remove(item.id, item.name)"
                />
              </td>
            </tr>
          </tbody>
        </table>

      </div>

      <div v-if="total > pageSize" class="hb-pane-foot">
        <ListPager :page="page" :total="total" :page-size="pageSize" @update:page="go" />
      </div>
    </div>

    <!-- 移动端：整页滚动；行卡片与主页「最近新增」统一（.hb-list / .hb-list-row） -->
    <ClientOnly>
      <template v-if="isMobile">
        <!-- 移动端搜索框：与主页同一套（SearchBox） -->
        <SearchBox v-model="filters.q" :placeholder="t('item.searchPlaceholderAll')" @submit="applyFilters" />
        <div v-if="filters.tagId" class="tag-filter">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            icon="i-lucide-tag"
            trailing-icon="i-lucide-x"
            class="hb-tap"
            @click="clearTagFilter"
          >
            {{ t('item.tags') }}
          </UButton>
        </div>

        <ListSkeleton v-if="pending" :rows="6" card />

        <EmptyState v-else-if="!items.length" :text="t('item.empty')" icon="i-lucide-package">
          <UButton size="sm" @click="navigateTo('/items/new')">{{ t('item.new') }}</UButton>
        </EmptyState>

        <ul v-else class="hb-list">
          <SwipeRow
            v-for="item in items"
            :key="item.id"
            @edit="navigateTo(`/items/${item.id}?edit=1`)"
            @delete="remove(item.id, item.name)"
          >
            <div class="hb-list-row top" @click="navigateTo(`/items/${item.id}`)">
              <span class="hb-icon-tile small"><UIcon name="i-lucide-package" /></span>

              <div class="hb-list-main">
                <p class="hb-list-title">{{ item.name }}</p>
                <p class="hb-list-sub">
                  <UIcon name="i-lucide-map-pin" class="inline-icon" />
                  <span class="hb-truncate">
                    {{ item.location?.name || t('item.noLocation') }}
                    <template v-if="item.model"> · {{ item.model }}</template>
                  </span>
                </p>
                <div class="hb-list-meta">
                  <span class="hb-chip tiny hb-num">×{{ item.quantity }}</span>
                  <span v-if="item.unitCount" class="hb-chip tiny hb-num">{{ item.unitCount }} SN</span>
                  <!-- 条码只在没有标签时占位，避免和标签挤成两行 -->
                  <span v-if="(item.barcode || item.traceCode) && !item.tags.length" class="hb-chip tiny hb-mono">{{ item.barcode || item.traceCode }}</span>
                  <span
                    v-for="tag in item.tags.slice(0, 2)"
                    :key="tag.id"
                    class="hb-tag"
                    :style="{ color: tag.color }"
                  >
                    {{ tag.name }}
                  </span>
                  <span v-if="item.tags.length > 2" class="hb-muted hb-num">+{{ item.tags.length - 2 }}</span>
                </div>
              </div>

              <div class="hb-list-side">
                <span class="hb-num">{{ money(item.price * item.quantity) }}</span>
              </div>
            </div>
          </SwipeRow>
        </ul>

        <ListPager :page="page" :total="total" :page-size="pageSize" @update:page="go" />
      </template>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
// 桌面：面板内滚动；移动：整页滚动（更符合移动端操作习惯）
definePageMeta({ layoutMode: 'fixed', layoutModeMobile: 'scroll' });

interface Item {
  id: number;
  name: string;
  quantity: number;
  price: number;
  model: string | null;
  barcode: string | null;
  traceCode: string | null;
  location: { id: number; name: string } | null;
  tags: { id: number; name: string; color: string }[];
  unitCount: number;
}

const { t } = useI18n();
const api = useApi();
const route = useRoute();
const toast = useToast();
const { money } = useFormat();
const isMobile = useBreakpoint();

const page = ref(1);
const pageSize = 50;
const exporting = ref(false);

const filters = reactive({
  q: (route.query.q as string) ?? '',
  // 物品页不再提供标签选择器；仅保留从主页/搜索页标签书签进来的筛选
  tagId: route.query.tagId ? Number(route.query.tagId) : null,
});

const hasFilters = computed(() => !!filters.q || filters.tagId !== null);

const { data, pending, refresh } = await useAsyncData(
  'items-list',
  () =>
    api.get<{ items: Item[]; total: number }>('/items', {
      q: filters.q || undefined,
      tagId: filters.tagId ?? undefined,
      page: page.value,
      pageSize,
    }),
  { server: false, watch: [page, () => filters.tagId], default: () => ({ items: [], total: 0 }) },
);

const items = computed(() => data.value?.items ?? []);
const total = computed(() => data.value?.total ?? 0);

function applyFilters() {
  page.value = 1;
  void refresh();
}

function clearTagFilter() {
  filters.tagId = null;
  applyFilters();
}

function clearFilters() {
  filters.q = '';
  filters.tagId = null;
  applyFilters();
}

function go(next: number) {
  page.value = Math.max(1, next);
}

async function remove(id: number, name: string) {
  if (!window.confirm(t('item.deleteConfirm', { name }))) return;
  try {
    await api.del(`/items/${id}`);
    toast.add({ title: t('common.deleted'), color: 'success' });
    await refresh();
  } catch (error) {
    toast.add({ title: (error as { message?: string }).message ?? t('errors.unknown'), color: 'error' });
  }
}

/** CSV 导出（带当前筛选条件与鉴权头） */
async function exportCsv() {
  exporting.value = true;
  try {
    const query = new URLSearchParams();
    if (filters.q) query.set('q', filters.q);
    if (filters.tagId) query.set('tagId', String(filters.tagId));

    const blob = await api.request<Blob>(`/items/export.csv?${query.toString()}`, { responseType: 'blob' });
    const url = URL.createObjectURL(blob as unknown as Blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'homebucket-items.csv';
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    toast.add({ title: (error as { message?: string }).message ?? t('errors.unknown'), color: 'error' });
  } finally {
    exporting.value = false;
  }
}
</script>

<style scoped>
.pad {
  padding: 12px 16px;
}

.table-desktop {
  min-width: 760px;
}

.ops-col {
  width: 48px;
  text-align: right;
}

/* 移动端列表使用全局 .hb-list / .hb-list-row / .hb-tag / .hb-list-side（见 assets/css/main.css） */

/* 左滑行：分隔线与裁剪由 SwipeRow 的 .swipe-item 负责，行自身不再画线 */
.hb-list-row {
  border-bottom: 0;
}

/* 从标签书签进来时的筛选提示（移动端） */
.tag-filter {
  margin: 0 0 14px;
}

@media (max-width: 767px) {
  .hide-sm {
    display: none;
  }
}
</style>
