<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Pager from '../components/Pager.vue';
import { capture, useApi } from '../composables/useApi';
import type { ItemListPage, Loaded } from '../composables/useApi';

const api = useApi();
const route = useRoute();
const { t } = useI18n();

/**
 * 首页是**公开页**（`login-gate` 的 `PUBLIC_PATHS` 里有 `/`），所以这里**不加**
 * `useAuthGate`。
 *
 * 踩过的坑：一开始把守卫也套到首页上，结果匿名访客打开首页会被 `useAuthGate`
 * 送去登录页 —— 而"查条码"本来就是不需要登录的功能（老实例契约也依赖它），
 * 等于把整站对公众关掉了。要求里的"不进入首页"指的是**受保护页面**未登录时
 * 不要先渲染出内容再跳，不是把首页本身变成登录墙。
 */

const keyword = ref(typeof route.query.q === 'string' ? route.query.q : '');
const pageSize = 20;

const query = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''));
const page = computed(() => Number(route.query.page ?? 1) || 1);

const { data, pending, refresh } = await useAsyncData<Loaded<ItemListPage>>(
  () => `items-${query.value}-${page.value}`,
  () => capture(() => api.search(query.value, page.value, pageSize)),
  {
    watch: [query, page],
    default: (): Loaded<ItemListPage> => ({ data: null, error: '', status: 0 }),
  },
);

const items = computed(() => data.value?.data?.items ?? []);
const total = computed(() => data.value?.data?.total ?? 0);
const error = computed(() => data.value?.error ?? '');
const loading = computed(() => pending.value);
/** 整串数字（够长）当成条码：查不到时按「未收录」提示，而不是「没有匹配」。 */
const barcodeLike = computed(() => /^\d{8,}$/.test(query.value.trim()));
/** 还没输入任何关键词：此时不该说「没有匹配」，而是告诉人从哪开始。 */
const idle = computed(() => query.value.trim() === '');

function itemPath(item: { barcode: string | null; id: number }): string {
  return `/items/${encodeURIComponent(item.barcode ?? String(item.id))}`;
}

function shortTime(value: string): string {
  return value.replace('T', ' ').slice(0, 16);
}

async function submit(): Promise<void> {
  const next = keyword.value.trim();
  const changed = next !== query.value || route.query.page !== undefined;
  await navigateTo({ query: { ...(next ? { q: next } : {}), page: undefined } }, { replace: true });
  // 关键词没变时路由不会触发 watch，按旧行为仍然重查一次
  if (!changed) await refresh();
}

async function goPage(value: number): Promise<void> {
  await navigateTo({ query: { ...route.query, page: value > 1 ? String(value) : undefined } }, { replace: true });
}

watch(query, (value) => {
  if (value !== keyword.value) keyword.value = value;
});

useHead({ title: computed(() => t('search.title')) });
</script>

<template>
  <div data-testid="page-head" class="flex flex-wrap items-baseline gap-3">
    <h1 class="m-0 text-2xl font-semibold tracking-tight">{{ t('search.title') }}</h1>
    <UBadge v-if="total > 0" color="neutral" variant="soft" size="sm" class="tabular">{{ t('common.totalCount', { count: total }) }}</UBadge>
  </div>
  <p class="mt-2 mb-6 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
    {{ t('search.intro') }}
  </p>

  <form class="flex gap-2.5" @submit.prevent="submit">
    <UInput
      v-model="keyword"
      size="lg"
      class="min-w-0 flex-1"
      data-testid="search-input"
      type="search"
      :aria-label="t('common.ariaSearchInput')"
      :placeholder="t('search.placeholder')"
      autofocus
    >
      <template #leading>
        <AppIcon name="search" class="h-[18px] w-[18px] text-gray-400" />
      </template>
    </UInput>
    <UButton
      data-testid="search-submit"
      type="submit"
      color="primary"
      size="lg"
      :loading="loading"
      :aria-label="t('search.ariaSubmit')"
    >
      {{ loading ? t('common.searching') : t('common.search') }}
    </UButton>
  </form>

  <AppNotice v-if="error" tone="error" class="mt-4" data-testid="notice">{{ error }}</AppNotice>

  <div class="mt-4 grid gap-2.5">
    <NuxtLink
      v-for="item in items"
      :key="item.id"
      data-testid="item-row"
      :to="itemPath(item)"
      class="hb-card hb-card-hover flex items-start gap-3.5 p-5 text-inherit no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:focus-visible:ring-blue-400/40"
    >
      <!-- 结果行只看缩略图，不给它单独的可访问名：整行已经是链接，图再带 alt 会被读两遍 -->
      <img
        v-if="item.imageUrls.length > 0"
        class="h-12 w-12 shrink-0 rounded-lg border border-gray-200 object-cover dark:border-gray-800"
        :src="item.imageUrls[0]"
        alt=""
      />
      <span
        v-else
        class="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
        :aria-label="t('search.noImage')"
      >
        <AppIcon name="box" class="h-5 w-5" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate font-semibold">{{ item.name || t('search.noName') }}</span>
        <span class="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
          <template v-if="item.barcode"><span class="font-mono">{{ item.barcode }}</span>{{ t('common.listSep') }}</template>
          {{ [item.manufacturer, item.model, item.category].filter(Boolean).join(t('common.listSep')) || t('search.noManufacturer') }}
        </span>
        <span class="mt-0.5 block text-xs text-gray-500 tabular dark:text-gray-400">
          {{ t('search.summary', { instances: item.instanceCount, contributions: item.contributionCount, time: shortTime(item.updatedAt) }) }}
        </span>
      </span>
    </NuxtLink>
  </div>

  <!-- 空状态分三种：没搜（教怎么用）、搜了没结果、数字条码没收录。分开说才不会误导。 -->
  <AppEmpty
    v-if="!loading && items.length === 0 && !error && idle"
    icon="search"
    class="mt-6"
    data-testid="empty-state"
  >
    <span class="block font-medium text-gray-900 dark:text-white">{{ t('search.hintTitle') }}</span>
    <span class="mt-1 block">{{ t('search.hint') }}</span>
  </AppEmpty>
  <AppEmpty
    v-else-if="!loading && items.length === 0 && !error"
    icon="box"
    class="mt-6"
    data-testid="empty-state"
  >
    {{ t('search.empty') }}
  </AppEmpty>

  <AppNotice
    v-if="!loading && items.length === 0 && !error && barcodeLike"
    tone="neutral"
    class="mt-4"
    data-testid="notice"
  >
    {{ t('search.notCollected') }}
  </AppNotice>

  <Pager :page="page" :page-size="pageSize" :total="total" @update:page="goPage" />
</template>
