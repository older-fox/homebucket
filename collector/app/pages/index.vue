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

const input =
  'w-full min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 transition-colors duration-150 outline-none placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500';
const primaryButton =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-gray-950';
/** 结果行是整块可点的链接：hover 才有抬升与阴影（规范 §1.2 阴影只出现在交互态） */
const resultRow =
  'flex items-start gap-3.5 rounded-2xl border border-gray-200 bg-white p-4 text-inherit no-underline transition duration-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-lg hover:shadow-gray-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 dark:hover:shadow-black/30';
const errorNotice = 'flex items-start gap-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400';
const warnNotice = 'flex items-start gap-2 rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700 dark:bg-amber-950/50 dark:text-amber-300';
/** 空状态按规范 §6.9：48px 圆形浅蓝图标容器 + 一句灰字 + 次级动作 */
const emptyIcon = 'grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300';
</script>

<template>
  <div data-testid="page-head" class="flex flex-wrap items-baseline gap-3">
    <h1 class="m-0 text-2xl font-semibold tracking-tight">{{ t('search.title') }}</h1>
    <UBadge v-if="total > 0" color="neutral" variant="soft" size="sm">{{ t('common.totalCount', { count: total }) }}</UBadge>
  </div>
  <p class="mt-2 mb-6 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
    {{ t('search.intro') }}
  </p>

  <form class="flex gap-2.5" @submit.prevent="submit">
    <input
      v-model="keyword"
      :class="input"
      data-testid="search-input"
      type="search"
      :aria-label="t('common.ariaSearchInput')"
      :placeholder="t('search.placeholder')"
      autofocus
    />
    <button
      data-testid="search-submit"
      :class="primaryButton"
      type="submit"
      :disabled="loading"
      :aria-label="t('search.ariaSubmit')"
    >
      {{ loading ? t('common.searching') : t('common.search') }}
    </button>
  </form>

  <p v-if="error" :class="[errorNotice, 'mt-4']" data-testid="notice">{{ error }}</p>

  <div class="mt-4 grid gap-2.5">
    <NuxtLink
      v-for="item in items"
      :key="item.id"
      data-testid="item-row"
      :to="itemPath(item)"
      :class="resultRow"
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
          <template v-if="item.barcode"><span class="font-mono">{{ item.barcode }}</span> · </template>
          {{ [item.manufacturer, item.model, item.category].filter(Boolean).join(' · ') || t('search.noManufacturer') }}
        </span>
        <span class="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
          {{ t('search.summary', { instances: item.instanceCount, contributions: item.contributionCount, time: shortTime(item.updatedAt) }) }}
        </span>
      </span>
    </NuxtLink>
  </div>

  <!-- 空状态分三种：没搜（教怎么用）、搜了没结果、数字条码没收录。分开说才不会误导。 -->
  <div
    v-if="!loading && items.length === 0 && !error && idle"
    class="mt-6 flex flex-col items-center gap-3 py-10 text-center"
    data-testid="empty-state"
  >
    <span :class="emptyIcon"><AppIcon name="search" class="h-6 w-6" /></span>
    <p class="m-0 text-sm font-medium text-gray-900 dark:text-white">{{ t('search.hintTitle') }}</p>
    <p class="m-0 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">{{ t('search.hint') }}</p>
  </div>
  <div
    v-else-if="!loading && items.length === 0 && !error"
    class="mt-6 flex flex-col items-center gap-3 py-10 text-center"
    data-testid="empty-state"
  >
    <span :class="emptyIcon"><AppIcon name="box" class="h-6 w-6" /></span>
    <p class="m-0 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">{{ t('search.empty') }}</p>
  </div>

  <p v-if="!loading && items.length === 0 && !error && barcodeLike" :class="[warnNotice, 'mt-4']" data-testid="notice">
    <AppIcon name="alert" class="mt-0.5 h-4 w-4 shrink-0" />
    <span>{{ t('search.notCollected') }}</span>
  </p>

  <Pager :page="page" :page-size="pageSize" :total="total" @update:page="goPage" />
</template>
