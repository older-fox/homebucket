<template>
  <div>
    <!-- ============ 页头 ============ -->
    <header class="head hb-rise">
      <div>
        <p class="eyebrow">{{ current?.name ?? t('dashboard.title') }}</p>
        <h1>{{ t('dashboard.title') }}</h1>
        <p class="sub">
          {{ t('dashboard.pieces', { count: data?.counts.items ?? 0 }) }} ·
          {{ t('location.itemCount', { count: data?.counts.locations ?? 0 }) }}
        </p>
      </div>
      <div class="head-actions">
        <UButton color="neutral" variant="soft" icon="i-lucide-folder-plus" class="hb-tap" @click="navigateTo('/locations')">
          <span class="hide-sm">{{ t('dashboard.quickAddLocation') }}</span>
        </UButton>
        <UButton icon="i-lucide-plus" class="hb-tap" @click="navigateTo('/items/new')">
          <span class="hide-sm">{{ t('dashboard.quickAddItem') }}</span>
        </UButton>
      </div>
    </header>

    <!-- ============ 搜索 ============ -->
    <form class="search hb-card" @submit.prevent="submitSearch">
      <UIcon name="i-lucide-search" class="search-icon" />
      <input
        v-model="keyword"
        class="search-input"
        type="search"
        enterkeyhint="search"
        :placeholder="t('common.searchPlaceholder')"
      />
      <UButton type="submit" size="sm" class="hb-tap search-btn">{{ t('common.search') }}</UButton>
    </form>

    <!-- ============ 统计卡片 ============ -->
    <section class="stats">
      <article v-for="(card, index) in statCards" :key="card.key" class="hb-tile hb-card-hover hb-rise stat" :style="{ animationDelay: `${index * 40}ms` }">
        <span class="hb-icon-tile">
          <UIcon :name="card.icon" />
        </span>
        <div class="stat-body">
          <p class="stat-label">{{ t(`dashboard.${card.key}`) }}</p>
          <p v-if="pending" class="hb-skeleton stat-skeleton" />
          <p v-else class="stat-value hb-num">{{ card.value }}</p>
        </div>
      </article>
    </section>

    <!-- ============ 最近新增 ============ -->
    <section class="block">
      <div class="block-head">
        <h2 class="hb-section-title">
          <UIcon name="i-lucide-history" />
          {{ t('dashboard.recentItems') }}
        </h2>
        <NuxtLink to="/items" class="link">{{ t('common.more') }}</NuxtLink>
      </div>

      <div v-if="pending" class="hb-card list">
        <div v-for="n in 3" :key="n" class="hb-skeleton row-skeleton" />
      </div>

      <EmptyState v-else-if="!data?.recentItems?.length" :text="t('dashboard.noRecent')" icon="i-lucide-package-open">
        <UButton size="sm" @click="navigateTo('/items/new')">{{ t('dashboard.quickAddItem') }}</UButton>
      </EmptyState>

      <ul v-else class="hb-card list">
        <li
          v-for="item in data.recentItems"
          :key="item.id"
          class="hb-row clickable"
          @click="navigateTo(`/items/${item.id}`)"
        >
          <span class="hb-icon-tile small">
            <UIcon name="i-lucide-package" />
          </span>
          <div class="row-main">
            <p class="row-title">{{ item.name }}</p>
            <p class="row-sub">
              <UIcon name="i-lucide-map-pin" class="inline-icon" />
              {{ item.location?.name || t('item.noLocation') }}
              <span v-if="item.unitCount" class="hb-chip tiny hb-num">{{ item.unitCount }} SN</span>
            </p>
          </div>
          <div class="row-side">
            <span class="qty hb-num">×{{ item.quantity }}</span>
            <span class="price hb-num">{{ money(item.price * item.quantity) }}</span>
          </div>
        </li>
      </ul>
    </section>

    <!-- ============ 位置 + 标签 ============ -->
    <div class="cols">
      <section class="block">
        <div class="block-head">
          <h2 class="hb-section-title">
            <UIcon name="i-lucide-map-pinned" />
            {{ t('dashboard.locationList') }}
          </h2>
          <NuxtLink to="/locations" class="link">{{ t('common.more') }}</NuxtLink>
        </div>

        <div v-if="pending" class="hb-skeleton panel-skeleton" />
        <EmptyState
          v-else-if="!data?.locations?.length"
          :text="t('dashboard.noLocations')"
          icon="i-lucide-map-pinned"
        />
        <div v-else class="loc-grid">
          <button
            v-for="location in topLocations"
            :key="location.id"
            type="button"
            class="hb-card hb-card-hover loc"
            @click="navigateTo(`/locations?focus=${location.id}`)"
          >
            <span class="hb-icon-tile small"><UIcon name="i-lucide-folder" /></span>
            <span class="loc-name">{{ location.name }}</span>
            <span class="loc-meta hb-num">
              {{ location.itemCount }} · {{ location.childCount }}
            </span>
          </button>
        </div>
      </section>

      <section class="block">
        <div class="block-head">
          <h2 class="hb-section-title">
            <UIcon name="i-lucide-tag" />
            {{ t('dashboard.tagList') }}
          </h2>
          <NuxtLink to="/items" class="link">{{ t('common.more') }}</NuxtLink>
        </div>

        <div v-if="pending" class="hb-skeleton panel-skeleton" />
        <EmptyState v-else-if="!data?.tags?.length" :text="t('dashboard.noTags')" icon="i-lucide-tag" />
        <div v-else class="tags">
          <button
            v-for="tag in data.tags"
            :key="tag.id"
            type="button"
            class="tag hb-tap"
            :style="{ '--tag-color': tag.color }"
            @click="navigateTo({ path: '/items', query: { tagId: tag.id } })"
          >
            <span class="tag-dot" />
            <span class="tag-name">{{ tag.name }}</span>
            <span class="tag-count hb-num">{{ tag.itemCount }}</span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
interface DashboardItem {
  id: number;
  name: string;
  quantity: number;
  price: number;
  location: { id: number; name: string } | null;
  tags: { id: number; name: string; color: string }[];
  unitCount: number;
}

interface Dashboard {
  family: { name: string; currency: string; locale: string } | null;
  counts: { items: number; locations: number; tags: number };
  totalValue: number;
  recentItems: DashboardItem[];
  locations: { id: number; name: string; parentId: number | null; itemCount: number; childCount: number }[];
  tags: { id: number; name: string; color: string; itemCount: number }[];
}

const { t } = useI18n();
const api = useApi();
const { current, load } = useFamily();
const { money, number } = useFormat();

onMounted(load);

const keyword = ref('');

const { data, pending } = await useAsyncData('dashboard', () => api.get<Dashboard>('/dashboard'), {
  server: false,
  default: () => null,
});

const statCards = computed(() => [
  { key: 'itemsTotal', icon: 'i-lucide-package', value: number(data.value?.counts.items ?? 0) },
  { key: 'valueTotal', icon: 'i-lucide-wallet', value: money(data.value?.totalValue ?? 0) },
  { key: 'locationsTotal', icon: 'i-lucide-map-pinned', value: number(data.value?.counts.locations ?? 0) },
  { key: 'tagsTotal', icon: 'i-lucide-tag', value: number(data.value?.counts.tags ?? 0) },
]);

const topLocations = computed(() => (data.value?.locations ?? []).slice(0, 6));

function submitSearch() {
  const q = keyword.value.trim();
  if (q) navigateTo({ path: '/search', query: { q } });
}
</script>

<style scoped>
/* ---------------- 页头 ---------------- */
.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.eyebrow {
  margin: 0 0 2px;
  font-size: var(--hb-fs-xs);
  font-weight: var(--hb-fw-semibold);
  letter-spacing: var(--hb-ls-eyebrow);
  text-transform: uppercase;
  color: var(--hb-brand);
}

h1 {
  margin: 0;
  font-size: var(--hb-fs-display);
  font-weight: var(--hb-fw-bold);
  letter-spacing: var(--hb-ls-display);
  line-height: var(--hb-lh-display);
}

.sub {
  margin: 6px 0 0;
  font-size: var(--hb-fs-sm);
  color: var(--hb-muted);
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* ---------------- 搜索 ---------------- */
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 14px;
  margin-bottom: 20px;
}

.search-icon {
  width: 18px;
  height: 18px;
  color: var(--hb-muted);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 34px;
  border: 0;
  background: transparent;
  color: var(--hb-text);
  font-size: 15px;
  outline: none;
}

.search-input::placeholder {
  color: var(--hb-muted);
}

/* ---------------- 统计卡片 ---------------- */
.stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 16px;
}

.stat-body {
  min-width: 0;
}

.stat-label {
  margin: 0;
  font-size: var(--hb-fs-sm);
  color: var(--hb-muted);
}

.stat-value {
  margin: 4px 0 0;
  font-size: var(--hb-fs-h1);
  font-weight: var(--hb-fw-bold);
  letter-spacing: var(--hb-ls-h2);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-skeleton {
  width: 72px;
  height: 22px;
  margin: 6px 0 0;
}

/* ---------------- 区块 ---------------- */
.block {
  margin-bottom: 26px;
}

.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.hb-section-title :deep(svg) {
  width: 17px;
  height: 17px;
  color: var(--hb-brand);
}

.link {
  font-size: var(--hb-fs-sm);
  font-weight: var(--hb-fw-semibold);
  color: var(--hb-brand);
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}

/* ---------------- 列表 ---------------- */
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

.row-skeleton {
  height: 52px;
  margin: 10px 14px;
}

.clickable {
  cursor: pointer;
}

.hb-icon-tile.small {
  width: 36px;
  height: 36px;
}

.hb-icon-tile :deep(svg) {
  width: 20px;
  height: 20px;
}

.hb-icon-tile.small :deep(svg) {
  width: 18px;
  height: 18px;
}

.row-main {
  flex: 1;
  min-width: 0;
}

.row-title {
  margin: 0;
  font-size: var(--hb-fs-body);
  font-weight: var(--hb-fw-semibold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 3px 0 0;
  font-size: var(--hb-fs-xs);
  color: var(--hb-muted);
  min-width: 0;
}

.inline-icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}

.hb-chip.tiny {
  padding: 1px 7px;
  font-size: 11px;
}

.row-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}

.qty {
  font-size: var(--hb-fs-xs);
  color: var(--hb-muted);
}

.price {
  font-size: var(--hb-fs-body);
  font-weight: var(--hb-fw-semibold);
  font-variant-numeric: tabular-nums;
}

/* ---------------- 位置网格 ---------------- */
.loc-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.loc {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--hb-border);
  background: var(--hb-surface);
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  width: 100%;
}

.loc-name {
  flex: 1;
  min-width: 0;
  font-size: var(--hb-fs-body);
  font-weight: var(--hb-fw-semibold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loc-meta {
  font-size: var(--hb-fs-xs);
  color: var(--hb-muted);
  font-variant-numeric: tabular-nums;
}

.panel-skeleton {
  height: 120px;
}

/* ---------------- 书签式标签 ---------------- */
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 40px;
  padding: 8px 14px;
  border-radius: var(--hb-r-full);
  border: 1px solid color-mix(in srgb, var(--tag-color) 45%, var(--hb-border));
  background: color-mix(in srgb, var(--tag-color) 10%, var(--hb-surface));
  color: var(--hb-text);
  font-size: var(--hb-fs-sm);
  font-weight: var(--hb-fw-medium);
  cursor: pointer;
  transition:
    transform var(--hb-dur) var(--hb-ease),
    box-shadow var(--hb-dur) var(--hb-ease);
}

.tag:hover {
  transform: translateY(-1px);
  box-shadow: var(--hb-shadow-sm);
}

.tag-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tag-color);
}

.tag-count {
  padding: 0 6px;
  border-radius: var(--hb-r-full);
  background: color-mix(in srgb, var(--tag-color) 18%, transparent);
  font-size: var(--hb-fs-xs);
  font-variant-numeric: tabular-nums;
}

/* ---------------- 断点 ---------------- */
@media (min-width: 768px) {
  .stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }

  .stat {
    padding: 18px;
  }

  .stat-value {
    font-size: var(--hb-fs-display);
  }

  .cols {
    display: grid;
    grid-template-columns: 1.15fr 1fr;
    gap: 24px;
    align-items: start;
  }

  .loc-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .hide-sm {
    display: none;
  }

  .search-btn {
    display: none;
  }
}
</style>
