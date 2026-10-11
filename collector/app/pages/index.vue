<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Pager from '../components/Pager.vue';
import { capture, useApi } from '../composables/useApi';
import type { ItemListPage, Loaded } from '../composables/useApi';

const api = useApi();
const route = useRoute();

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

function itemPath(item: { barcode: string | null; id: number }): string {
  return `/items/${encodeURIComponent(item.barcode ?? String(item.id))}`;
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

useHead({ title: '条码资料库' });

const input =
  'w-full min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-[15px] text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-brand-700/40';
const primaryButton =
  'inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50';
const chip = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
const errorNotice = 'mt-3.5 rounded-lg border border-red-500/30 bg-red-50 px-3 py-2.5 text-[13.5px] text-red-700 dark:bg-red-500/10 dark:text-red-300';
const warnNotice = 'mt-3.5 rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2.5 text-[13.5px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
</script>

<template>
  <div class="flex flex-wrap items-baseline gap-3" data-testid="page-head">
    <h1 class="m-0 text-2xl font-bold">条码资料库</h1>
    <span :class="chip">{{ total }} 条</span>
  </div>
  <p class="m-0 mb-4 text-[13.5px] text-slate-500 dark:text-slate-400">
    所有 HomeBucket 实例共享的物品资料。输入完整条码可以直接跳到详情；输入关键词则搜索名称、型号、厂商、分类。
  </p>

  <form class="flex gap-2.5" @submit.prevent="submit">
    <input
      v-model="keyword"
      :class="input"
      data-testid="search-input"
      type="search"
      placeholder="条码 / 名称 / 型号 / 厂商，例如 6901234567892"
      autofocus
    />
    <button data-testid="search-submit" :class="primaryButton" type="submit" :disabled="loading">
      {{ loading ? '查询中…' : '查询' }}
    </button>
  </form>

  <p v-if="error" :class="errorNotice" data-testid="notice">{{ error }}</p>

  <div class="mt-4 grid gap-2.5">
    <NuxtLink
      v-for="item in items"
      :key="item.id"
      data-testid="item-row"
      :to="itemPath(item)"
      class="flex items-start gap-3.5 rounded-[10px] border border-slate-200 bg-white p-3.5 text-inherit no-underline transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
    >
      <img v-if="item.imageUrls.length > 0" class="h-[46px] w-[46px] shrink-0 rounded-lg object-cover" :src="item.imageUrls[0]" :alt="item.name ?? ''" />
      <span v-else class="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-lg bg-slate-100 text-lg dark:bg-slate-800">📦</span>
      <span class="min-w-0 flex-1">
        <span class="block font-semibold">{{ item.name || '（还没有名称）' }}</span>
        <span class="block text-[12.5px] text-slate-500 dark:text-slate-400">
          <template v-if="item.barcode"><span class="font-mono">{{ item.barcode }}</span> · </template>
          {{ [item.manufacturer, item.model, item.category].filter(Boolean).join(' · ') || '暂无厂商/型号/分类' }}
        </span>
        <span class="block text-[12.5px] text-slate-500 dark:text-slate-400">
          {{ item.instanceCount }} 个实例上报过 · 共 {{ item.contributionCount }} 次 · 更新于
          {{ item.updatedAt.replace('T', ' ').slice(0, 16) }}
        </span>
      </span>
    </NuxtLink>
  </div>

  <p
    v-if="!loading && items.length === 0 && !error"
    class="mt-4 text-slate-500 dark:text-slate-400"
    data-testid="empty-state"
  >
    没有匹配的资料。换个关键词试试，或者等实例上报 —— 实例会在扫描条码时自动汇报。
  </p>
  <p v-if="!loading && items.length === 0 && !error && barcodeLike" :class="warnNotice" data-testid="notice">
    未收录：这个条码还没有任何实例上报过。等实例扫到它时会自动汇报。
  </p>

  <Pager :page="page" :page-size="pageSize" :total="total" @update:page="goPage" />
</template>
