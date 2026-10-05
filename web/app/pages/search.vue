<template>
  <div>
    <PageHeader :title="t('search.title')" :description="query ? t('search.resultsFor', { query }) : t('search.empty')" />

    <form class="search-bar" @submit.prevent="runSearch">
      <UInput
        v-model="keyword"
        :placeholder="t('common.searchPlaceholder')"
        icon="i-lucide-search"
        size="xl"
        class="search-input"
        type="search"
        enterkeyhint="search"
        autofocus
      />
      <UButton type="submit" size="xl" class="hb-tap search-btn">{{ t('common.search') }}</UButton>
    </form>

    <template v-if="results">
      <EmptyState v-if="isEmpty" :text="t('search.noResults')" icon="i-lucide-search-x" />

      <template v-else>
        <section v-if="results.items.length" class="block">
          <h2>{{ t('search.items') }}</h2>
          <ul class="hb-list">
            <li v-for="item in results.items" :key="item.id" class="hb-list-row" @click="navigateTo(`/items/${item.id}`)">
              <div class="hb-list-main">
                <span class="hb-list-title">{{ item.name }}</span>
                <span class="hb-list-sub">
                  {{ item.location?.name || t('item.noLocation') }}
                  <template v-if="item.model"> · {{ item.model }}</template>
                </span>
              </div>
              <span class="hb-list-side hb-num">{{ money(item.price) }}</span>
            </li>
          </ul>
        </section>

        <section v-if="results.units.length" class="block">
          <h2>{{ t('search.units') }}</h2>
          <ul class="hb-list">
            <li v-for="unit in results.units" :key="unit.id" class="hb-list-row" @click="navigateTo(`/items/${unit.itemId}`)">
              <div class="hb-list-main">
                <span class="hb-list-title hb-mono">{{ unit.sn }}</span>
                <span class="hb-list-sub">
                  {{ unit.item?.name }} · {{ unit.location?.name || t('item.noLocation') }}
                </span>
              </div>
              <UIcon name="i-lucide-chevron-right" class="hb-list-chev" />
            </li>
          </ul>
        </section>

        <section v-if="results.locations.length" class="block">
          <h2>{{ t('search.locations') }}</h2>
          <ul class="hb-list">
            <li
              v-for="location in results.locations"
              :key="location.id"
              class="hb-list-row"
              @click="navigateTo(`/locations?focus=${location.id}`)"
            >
              <div class="hb-list-main">
                <span class="hb-list-title">{{ location.name }}</span>
                <span class="hb-list-sub">
                  {{ t('location.itemCount', { count: location.itemCount }) }}
                  <template v-if="location.childCount"> · {{ t('location.childCount', { count: location.childCount }) }}</template>
                </span>
              </div>
              <UIcon name="i-lucide-chevron-right" class="hb-list-chev" />
            </li>
          </ul>
        </section>

        <section v-if="results.tags.length" class="block">
          <h2>{{ t('search.tags') }}</h2>
          <div class="bookmarks">
            <button
              v-for="tag in results.tags"
              :key="tag.id"
              type="button"
              class="bookmark hb-tap"
              :style="{ borderColor: tag.color, color: tag.color }"
              @click="navigateTo({ path: '/items', query: { tagId: tag.id } })"
            >
              {{ tag.name }}
              <span class="bookmark-count hb-num">{{ tag.itemCount }}</span>
            </button>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
interface SearchResults {
  query: string;
  items: { id: number; name: string; price: number; model: string | null; location: { id: number; name: string } | null }[];
  units: { id: number; sn: string | null; itemId: number; item: { name: string } | null; location: { id: number; name: string } | null }[];
  locations: { id: number; name: string; itemCount: number; childCount: number }[];
  tags: { id: number; name: string; color: string; itemCount: number }[];
}

const { t } = useI18n();
const api = useApi();
const route = useRoute();
const { money } = useFormat();

const keyword = ref((route.query.q as string) ?? '');
const query = computed(() => (route.query.q as string) ?? '');

const { data: results, refresh } = await useAsyncData<SearchResults | null>(
  'search-results',
  () => (query.value ? api.get<SearchResults>('/search', { q: query.value }) : Promise.resolve(null)),
  { server: false, watch: [query], default: () => null },
);

const isEmpty = computed(() => {
  const value = results.value;
  if (!value) return true;
  return !value.items.length && !value.units.length && !value.locations.length && !value.tags.length;
});

function runSearch() {
  const q = keyword.value.trim();
  navigateTo({ path: '/search', query: q ? { q } : undefined });
  void refresh();
}
</script>

<style scoped>
.search-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.search-input {
  flex: 1;
}

@media (max-width: 480px) {
  .search-btn {
    display: none;
  }
}

.block {
  margin-bottom: 20px;
}

h2 {
  margin: 0 0 8px;
  font-size: var(--hb-fs-h3);
  font-weight: var(--hb-fw-semibold);
}

/* 列表行使用全局 .hb-list / .hb-list-row / .hb-list-*（见 assets/css/main.css） */

.bookmarks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.bookmark {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  min-height: 40px;
  border: 1.5px solid;
  border-radius: 999px;
  background: var(--hb-surface);
  font-size: var(--hb-fs-sm);
  cursor: pointer;
}

.bookmark-count {
  opacity: 0.7;
  font-size: var(--hb-fs-xs);
}
</style>
