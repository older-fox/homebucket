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

    <!-- 工具条：一行搞定，标签默认收起，避免把控件撑高 -->
    <div class="hb-toolbar">
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
      <LocationPicker v-model="filters.locationId" class="filter-location" />
      <UButton
        color="neutral"
        :variant="filters.tagIds.length ? 'solid' : 'soft'"
        icon="i-lucide-tag"
        size="lg"
        class="hb-tap"
        @click="showTags = !showTags"
      >
        {{ t('item.tags') }}
        <span v-if="filters.tagIds.length" class="count hb-num">{{ filters.tagIds.length }}</span>
        <UIcon :name="showTags ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" />
      </UButton>
      <UButton size="lg" class="hb-tap" @click="applyFilters">{{ t('common.search') }}</UButton>
      <UButton v-if="hasFilters" color="neutral" variant="ghost" size="lg" icon="i-lucide-x" class="hb-tap" @click="clearFilters">
        {{ t('common.all') }}
      </UButton>
    </div>

    <div v-if="showTags" class="tag-panel hb-card hb-rise">
      <TagPicker v-model="filters.tagIds" />
    </div>

    <!-- 固定面板：内容再多也在面板内滚动，不拉扯整页 -->
    <div class="hb-pane">
      <div class="hb-pane-body">
        <div v-if="pending" class="pad">
          <div v-for="n in 8" :key="n" class="hb-skeleton row-skeleton" />
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
              <td class="hb-mono muted">{{ item.barcode || '—' }}</td>
              <td class="num hb-num">{{ item.quantity }}</td>
              <td>{{ item.model || '—' }}</td>
              <td>{{ item.location?.name || t('item.noLocation') }}</td>
              <td>
                <span
                  v-for="tag in item.tags.slice(0, 3)"
                  :key="tag.id"
                  class="mini-tag"
                  :style="{ color: tag.color, borderColor: tag.color }"
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

        <!-- 移动端：卡片流（同样在面板内滚动） -->
        <ul v-if="items.length" class="cards">
          <li v-for="item in items" :key="item.id" class="card-row hb-tap" @click="navigateTo(`/items/${item.id}`)">
            <span class="hb-icon-tile small"><UIcon name="i-lucide-package" /></span>
            <div class="card-main">
              <span class="card-title">{{ item.name }}</span>
              <span class="card-sub">
                <UIcon name="i-lucide-map-pin" class="inline-icon" />
                {{ item.location?.name || t('item.noLocation') }}
                <template v-if="item.model"> · {{ item.model }}</template>
              </span>
              <span v-if="item.barcode" class="card-sub hb-mono hb-truncate">{{ item.barcode }}</span>
              <span class="card-meta">
                <span class="hb-chip tiny hb-num">×{{ item.quantity }}</span>
                <span v-if="item.unitCount" class="hb-chip tiny hb-num">{{ item.unitCount }} SN</span>
                <span
                  v-for="tag in item.tags.slice(0, 2)"
                  :key="tag.id"
                  class="mini-tag"
                  :style="{ color: tag.color, borderColor: tag.color }"
                >
                  {{ tag.name }}
                </span>
              </span>
            </div>
            <div class="card-side">
              <span class="price hb-num">{{ money(item.price * item.quantity) }}</span>
            </div>
          </li>
        </ul>
      </div>

      <div v-if="total > pageSize" class="hb-pane-foot">
        <span class="muted hb-num">{{ page }} / {{ Math.max(1, Math.ceil(total / pageSize)) }}</span>
        <div class="pager">
          <UButton color="neutral" variant="soft" size="sm" :disabled="page <= 1" @click="go(page - 1)">
            {{ t('common.prev') }}
          </UButton>
          <UButton
            color="neutral"
            variant="soft"
            size="sm"
            :disabled="page >= Math.ceil(total / pageSize)"
            @click="go(page + 1)"
          >
            {{ t('common.next') }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// contained：页面不产生文档级滚动，列表在面板内滚动
definePageMeta({ contained: true });

interface Item {
  id: number;
  name: string;
  quantity: number;
  price: number;
  model: string | null;
  barcode: string | null;
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
const showTags = ref(false);

const filters = reactive({
  q: (route.query.q as string) ?? '',
  locationId: route.query.locationId ? Number(route.query.locationId) : null,
  tagIds: route.query.tagId ? [Number(route.query.tagId)] : [],
});

const hasFilters = computed(() => !!filters.q || !!filters.locationId || filters.tagIds.length > 0);

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

function clearFilters() {
  filters.q = '';
  filters.locationId = null;
  filters.tagIds = [];
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
    if (filters.locationId) query.set('locationId', String(filters.locationId));
    if (filters.tagIds[0]) query.set('tagId', String(filters.tagIds[0]));

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
.filter-location {
  flex: 0 0 190px;
  align-self: center;
}

.count {
  margin: 0 2px;
  padding: 0 6px;
  border-radius: var(--hb-r-full);
  background: color-mix(in srgb, #fff 25%, transparent);
  font-size: var(--hb-fs-xs);
}

.tag-panel {
  flex-shrink: 0;
  padding: 12px 14px;
}

.pad {
  padding: 12px 16px;
}

.row-skeleton {
  height: 38px;
  margin-bottom: 8px;
}

.table-desktop {
  min-width: 760px;
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

.ops-col {
  width: 48px;
  text-align: right;
}

.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.inline-icon {
  width: 13px;
  height: 13px;
}

.hb-icon-tile.small {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
}

.hb-icon-tile.small :deep(svg) {
  width: 18px;
  height: 18px;
}

.card-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.mini-tag {
  display: inline-block;
  margin-right: 4px;
  padding: 0 7px;
  border: 1px solid;
  border-radius: var(--hb-r-full);
  font-size: var(--hb-fs-xs);
}

.cards {
  display: none;
  list-style: none;
  margin: 0;
  padding: 0;
}

.card-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--hb-border);
  cursor: pointer;
}

.card-row:hover {
  background: var(--hb-surface-2);
}

.card-main {
  flex: 1;
  min-width: 0;
}

.card-title {
  display: block;
  font-weight: var(--hb-fw-medium);
}

.card-sub {
  display: block;
  margin-top: 3px;
  font-size: var(--hb-fs-xs);
  color: var(--hb-muted);
}

.card-side {
  text-align: right;
  flex-shrink: 0;
}

.price {
  font-weight: var(--hb-fw-semibold);
}

.pager {
  display: flex;
  gap: 8px;
}

@media (max-width: 767px) {
  .table-desktop {
    display: none;
  }

  .cards {
    display: block;
  }

  .hide-sm {
    display: none;
  }

  .filter-location {
    flex: 1 1 100%;
  }

  /* 移动端：更大的行、更清晰的层级（列表不再"小得看不清"） */
  .card-row {
    align-items: flex-start;
    gap: 12px;
    padding: 14px;
    min-height: 72px;
  }

  .hb-icon-tile.small {
    width: 40px;
    height: 40px;
  }

  .hb-icon-tile.small :deep(svg) {
    width: 20px;
    height: 20px;
  }

  .card-title {
    font-size: var(--hb-fs-h3);
    font-weight: var(--hb-fw-semibold);
  }

  .card-sub {
    margin-top: 4px;
    font-size: var(--hb-fs-sm);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }

  .card-side .price {
    font-size: var(--hb-fs-h3);
    font-weight: var(--hb-fw-bold);
  }

  .mini-tag {
    padding: 1px 8px;
    font-size: var(--hb-fs-xs);
  }

  .inline-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }
}
</style>
