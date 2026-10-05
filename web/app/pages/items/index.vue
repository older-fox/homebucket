<template>
  <div>
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

    <!-- 统一搜索：名称/型号/制造商/描述 + SN/条码 + 位置 + 标签（后端一个 q 参数全包） -->
    <div class="filters">
      <UInput
        v-model="filters.q"
        :placeholder="t('item.searchPlaceholderAll')"
        icon="i-lucide-search"
        size="xl"
        class="grow"
        type="search"
        enterkeyhint="search"
        @keyup.enter="applyFilters"
      />
      <UButton size="xl" class="hb-tap" @click="applyFilters">{{ t('common.search') }}</UButton>
    </div>

    <div class="filters second">
      <LocationPicker v-model="filters.locationId" :placeholder="t('item.location')" class="filter-select" />
      <TagPicker v-model="filters.tagIds" class="filter-tags" />
    </div>

    <div v-if="pending" class="hb-skeleton skeleton" />
    <EmptyState v-else-if="!items.length" :text="t('item.empty')" icon="i-lucide-package">
      <UButton size="sm" @click="navigateTo('/items/new')">{{ t('item.new') }}</UButton>
    </EmptyState>

    <template v-else>
      <!-- 宽屏：表格；窄屏：卡片流（都不显示缩略图） -->
      <table class="table hb-card">
        <thead>
          <tr>
            <th>{{ t('item.name') }}</th>
            <th class="num">{{ t('item.quantity') }}</th>
            <th>{{ t('item.model') }}</th>
            <th>{{ t('item.location') }}</th>
            <th>{{ t('item.tags') }}</th>
            <th class="num">{{ t('item.price') }}</th>
            <th class="num">{{ t('item.totalPrice') }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" class="row" @click="navigateTo(`/items/${item.id}`)">
            <td class="name">
              {{ item.name }}
              <span v-if="item.unitCount" class="unit-badge hb-num">{{ item.unitCount }} SN</span>
            </td>
            <td class="num hb-num">{{ item.quantity }}</td>
            <td>{{ item.model || '—' }}</td>
            <td>{{ item.location?.name || t('item.noLocation') }}</td>
            <td>
              <span v-for="tag in item.tags" :key="tag.id" class="tag" :style="{ color: tag.color, borderColor: tag.color }">
                {{ tag.name }}
              </span>
            </td>
            <td class="num hb-num">{{ money(item.price) }}</td>
            <td class="num hb-num">{{ money(item.price * item.quantity) }}</td>
            <td class="ops">
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-trash-2"
                :aria-label="t('common.delete')"
                @click.stop="remove(item.id, item.name)"
              />
            </td>
          </tr>
        </tbody>
      </table>

      <ul class="cards">
        <li v-for="item in items" :key="item.id" class="card hb-card" @click="navigateTo(`/items/${item.id}`)">
          <div class="card-main">
            <span class="card-title">{{ item.name }}</span>
            <span class="card-sub">
              {{ item.location?.name || t('item.noLocation') }}
              <template v-if="item.model"> · {{ item.model }}</template>
            </span>
          </div>
          <div class="card-side">
            <span class="qty hb-num">×{{ item.quantity }}</span>
            <span class="price hb-num">{{ money(item.price * item.quantity) }}</span>
          </div>
        </li>
      </ul>

      <div v-if="total > pageSize" class="pager">
        <UButton color="neutral" variant="soft" :disabled="page <= 1" @click="go(page - 1)">
          {{ t('common.back') }}
        </UButton>
        <span class="pager-text hb-num">{{ page }} / {{ Math.ceil(total / pageSize) }}</span>
        <UButton color="neutral" variant="soft" :disabled="page >= Math.ceil(total / pageSize)" @click="go(page + 1)">
          {{ t('common.more') }}
        </UButton>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
interface Item {
  id: number;
  name: string;
  quantity: number;
  price: number;
  model: string | null;
  location: { id: number; name: string } | null;
  tags: { id: number; name: string; color: string }[];
  unitCount: number;
}

const { t } = useI18n();
const api = useApi();
const route = useRoute();
const toast = useToast();
const { money } = useFormat();

const page = ref(1);
const pageSize = 50;
const exporting = ref(false);

const filters = reactive({
  q: (route.query.q as string) ?? '',
  locationId: route.query.locationId ? Number(route.query.locationId) : null,
  tagIds: route.query.tagId ? [Number(route.query.tagId)] : [],
});

const { data, pending, refresh } = await useAsyncData(
  'items-list',
  () =>
    api.get<{ items: Item[]; total: number }>('/items', {
      q: filters.q || undefined,
      locationId: filters.locationId ?? undefined,
      tagId: filters.tagIds[0] ?? undefined,
      page: page.value,
      pageSize,
    }),
  { server: false, watch: [page, filters.tagIds], default: () => ({ items: [], total: 0 }) },
);

const items = computed(() => data.value?.items ?? []);
const total = computed(() => data.value?.total ?? 0);

function applyFilters() {
  page.value = 1;
  void refresh();
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

/** CSV 导出（带当前筛选条件与鉴权头，前端转 Blob 下载） */
async function exportCsv() {
  exporting.value = true;
  try {
    const query = new URLSearchParams();
    if (filters.q) query.set('q', filters.q);
    if (filters.locationId) query.set('locationId', String(filters.locationId));
    if (filters.tagIds[0]) query.set('tagId', String(filters.tagIds[0]));

    const response = await api.request<Blob>(`/items/export.csv?${query.toString()}`, {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(response as unknown as Blob);
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
.filters {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.second {
  flex-wrap: wrap;
}

.filter-select {
  flex: 1 1 200px;
}

.filter-tags {
  flex: 2 1 260px;
}

.grow {
  flex: 1;
}

.skeleton {
  height: 180px;
  border-radius: 12px;
}

.table {
  width: 100%;
  border-collapse: collapse;
  overflow: hidden;
  font-size: var(--hb-fs-sm);
}

.table th,
.table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--hb-border);
  white-space: nowrap;
}

.table th {
  font-weight: var(--hb-fw-semibold);
  color: var(--hb-muted);
  font-size: var(--hb-fs-xs);
}

.row {
  cursor: pointer;
}

.row:hover {
  background: var(--hb-surface-2);
}

.name {
  font-weight: var(--hb-fw-medium);
  white-space: normal;
}

.num {
  text-align: right;
}

.ops {
  width: 48px;
}

.unit-badge {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--hb-brand-soft);
  color: var(--hb-brand);
  font-size: var(--hb-fs-xs);
}

.tag {
  display: inline-block;
  margin-right: 4px;
  padding: 1px 8px;
  border: 1px solid;
  border-radius: 999px;
  font-size: var(--hb-fs-xs);
}

.cards {
  display: none;
  list-style: none;
  margin: 0;
  padding: 0;
  flex-direction: column;
  gap: 8px;
}

.card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
}

.card-title {
  display: block;
  font-weight: var(--hb-fw-medium);
}

.card-sub {
  display: block;
  margin-top: 2px;
  font-size: var(--hb-fs-xs);
  color: var(--hb-muted);
}

.card-side {
  margin-left: auto;
  text-align: right;
}

.qty {
  display: block;
  font-size: var(--hb-fs-xs);
  color: var(--hb-muted);
}

.price {
  font-weight: var(--hb-fw-semibold);
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 14px;
}

.pager-text {
  font-size: var(--hb-fs-sm);
  color: var(--hb-muted);
}

@media (max-width: 767px) {
  .table {
    display: none;
  }

  .cards {
    display: flex;
  }

  .hide-sm {
    display: none;
  }
}
/* ---------------- 表格密度与可读性 ---------------- */
.table th {
  position: sticky;
  top: var(--hb-topbar-h);
  z-index: 1;
  padding: 10px 12px;
  background: var(--hb-surface-2);
  border-bottom: 1px solid var(--hb-border);
}

.table td {
  padding: 11px 12px;
}

.table tbody tr:hover {
  background: var(--hb-surface-2);
}

.table .num {
  white-space: nowrap;
}

/* 数值列右对齐时留出间距，避免贴边 */
.table .num:last-of-type {
  padding-right: 16px;
}
</style>
