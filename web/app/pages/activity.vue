<template>
  <div>
    <PageHeader :title="t('history.title')" :description="t('history.subtitle')" />

    <div class="filters">
      <button
        v-for="option in filters"
        :key="option.value"
        type="button"
        class="hb-chip filter hb-tap"
        :class="{ active: targetType === option.value }"
        @click="setFilter(option.value)"
      >
        {{ option.label }}
      </button>
    </div>

    <ListSkeleton v-if="loading" :rows="6" />

    <template v-else-if="entries.length">
      <ActivityTimeline :entries="entries" @select="goItem" />
      <ListPager :page="page" :total="total" :page-size="pageSize" @update:page="onPage" />
    </template>

    <EmptyState v-else :text="t('history.empty')" icon="i-lucide-history" />
  </div>
</template>

<script setup lang="ts">
import type { ActivityEntry, ActivityPage } from '~/types/activity';

const { t } = useI18n();
const api = useApi();
const toast = useToast();

const targetType = ref('');
const page = ref(1);
const pageSize = 20;
const entries = ref<ActivityEntry[]>([]);
const total = ref(0);
const loading = ref(true);

const filters = computed(() => [
  { value: '', label: t('history.filterAll') },
  { value: 'item', label: t('history.filterItem') },
  { value: 'unit', label: t('history.filterUnit') },
  { value: 'location', label: t('history.filterLocation') },
]);

async function load() {
  loading.value = true;
  try {
    const query: Record<string, unknown> = { page: page.value, pageSize };
    // 空字符串表示"全部"，不传该参数
    if (targetType.value) query.targetType = targetType.value;
    const res = await api.get<ActivityPage>('/activity', query);
    entries.value = res.items;
    total.value = res.total;
  } catch (error) {
    toast.add({ title: (error as { message?: string }).message ?? t('errors.unknown'), color: 'error' });
  } finally {
    loading.value = false;
  }
}

function setFilter(value: string) {
  if (targetType.value === value) return;
  targetType.value = value;
  page.value = 1;
  void load();
}

function onPage(next: number) {
  page.value = next;
  void load();
}

function goItem(entry: ActivityEntry) {
  if (entry.itemId) void navigateTo(`/items/${entry.itemId}`);
}

onMounted(load);
</script>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: var(--hb-gap);
}

.filter {
  border: 1px solid var(--hb-border);
  background: var(--hb-surface);
  color: var(--hb-text-2);
  cursor: pointer;
}

.filter.active {
  background: var(--hb-brand-soft);
  border-color: transparent;
  color: var(--hb-brand);
  font-weight: var(--hb-fw-semibold);
}
</style>
