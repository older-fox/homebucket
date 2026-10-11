<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ContributionList from '../../components/ContributionList.vue';
import FieldSourceTable from '../../components/FieldSourceTable.vue';
import Pager from '../../components/Pager.vue';
import { capture, useApi } from '../../composables/useApi';
import type { ContributionListPage, ItemDetail, Loaded } from '../../composables/useApi';

const api = useApi();
const route = useRoute();

const barcode = computed(() => String(route.params.barcode ?? ''));
const trendPage = ref(1);
const trendPageSize = 10;

const { data: detailData, pending } = await useAsyncData<Loaded<ItemDetail>>(
  () => `item-${barcode.value}`,
  () => capture(() => api.item(barcode.value)),
  {
    watch: [barcode],
    default: (): Loaded<ItemDetail> => ({ data: null, error: '', status: 0 }),
  },
);

const { data: trendData } = await useAsyncData<Loaded<ContributionListPage>>(
  () => `item-trend-${barcode.value}-${trendPage.value}`,
  () => capture(() => api.itemContributions(barcode.value, trendPage.value, trendPageSize)),
  {
    watch: [barcode, trendPage],
    default: (): Loaded<ContributionListPage> => ({ data: null, error: '', status: 0 }),
  },
);

watch(barcode, () => {
  trendPage.value = 1;
});

const detail = computed(() => detailData.value?.data ?? null);
const notFound = computed(() => detailData.value?.status === 404);
const error = computed(() => (notFound.value ? '' : detailData.value?.error ?? ''));
const loading = computed(() => pending.value);
const contributions = computed(() => trendData.value?.data?.contributions ?? []);
const trendTotal = computed(() => trendData.value?.data?.total ?? 0);

function shortTime(value: string): string {
  return value.replace('T', ' ').slice(0, 16);
}

useHead({ title: '物品详情' });

const ghostButton =
  'inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[12.5px] font-medium text-slate-600 no-underline transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800';
const card = 'rounded-[10px] border border-slate-200 bg-white p-[18px] shadow-sm dark:border-slate-800 dark:bg-slate-900';
const chip = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
const chipWarn = 'border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
const chipTiny = 'text-[12px]';
const errorNotice = 'mt-3.5 rounded-lg border border-red-500/30 bg-red-50 px-3 py-2.5 text-[13.5px] text-red-700 dark:bg-red-500/10 dark:text-red-300';
const warnNotice = 'mt-3.5 rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2.5 text-[13.5px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
</script>

<template>
  <div class="flex flex-wrap items-center gap-2.5">
    <NuxtLink :class="ghostButton" to="/">← 返回查询</NuxtLink>
  </div>

  <p v-if="error" :class="errorNotice" data-testid="notice">{{ error }}</p>
  <p v-else-if="loading" class="mt-3.5 text-slate-500 dark:text-slate-400">载入中…</p>
  <p v-else-if="notFound" :class="warnNotice" data-testid="notice">
    未收录：这个条码还没有被任何实例上报过。等实例扫到它时会自动汇报。
  </p>

  <template v-if="detail">
    <div class="mt-3 flex flex-wrap items-baseline gap-3" data-testid="page-head">
      <h1 class="m-0 text-2xl font-bold">{{ detail.name || '（还没有名称）' }}</h1>
      <span v-if="detail.barcode" :class="[chip, 'font-mono']">{{ detail.barcode }}</span>
      <span v-for="field in detail.lockedFields" :key="field" :class="[chip, chipWarn]">{{ field }} 已锁定</span>
    </div>
    <p class="m-0 mb-4 text-[13.5px] text-slate-500 dark:text-slate-400">
      {{ [detail.manufacturer, detail.model, detail.category].filter(Boolean).join(' · ') || '暂无厂商 / 型号 / 分类' }}
      · {{ detail.instanceCount }} 个实例上报过 {{ detail.contributionCount }} 次
      · 首次见到 {{ shortTime(detail.firstSeenAt) }}，最后更新 {{ shortTime(detail.updatedAt) }}
    </p>

    <div class="grid gap-3 sm:grid-cols-2">
      <div :class="card">
        <h2 class="mt-0 mb-3 text-base font-semibold">资料</h2>
        <dl class="grid grid-cols-[96px_1fr] gap-x-2.5 gap-y-1 text-[13px]">
          <dt class="text-slate-500 dark:text-slate-400">身份键</dt>
          <dd class="m-0 break-words font-mono text-xs">{{ detail.identityKey }}</dd>
          <dt class="text-slate-500 dark:text-slate-400">描述</dt>
          <dd class="m-0 break-words">{{ detail.description || '—' }}</dd>
          <dt class="text-slate-500 dark:text-slate-400">基础单位</dt>
          <dd class="m-0 break-words">{{ detail.baseUnit || '—' }}</dd>
          <dt class="text-slate-500 dark:text-slate-400">扩展属性</dt>
          <dd class="m-0 break-words">
            <template v-if="Object.keys(detail.attributes).length > 0">
              <span
                v-for="(value, key) in detail.attributes"
                :key="key"
                :class="[chip, chipTiny, 'mr-1 mb-1']"
              >
                {{ key }}: {{ value }}
              </span>
            </template>
            <span v-else class="text-slate-500 dark:text-slate-400">—</span>
          </dd>
        </dl>
      </div>

      <div :class="card">
        <h2 class="mt-0 mb-3 text-base font-semibold">图片（{{ detail.imageUrls.length }}）</h2>
        <div class="flex flex-wrap gap-1.5">
          <img
            v-for="url in detail.imageUrls"
            :key="url"
            :src="url"
            alt="物品图片"
            class="h-[92px] w-[92px] rounded-lg border border-slate-200 object-cover dark:border-slate-700"
          />
        </div>
        <p v-if="detail.imageUrls.length === 0" class="mt-2 mb-0 text-[13px] text-slate-500 dark:text-slate-400">
          还没有图片。
        </p>
      </div>
    </div>

    <div :class="[card, 'mt-4']">
      <h2 class="mt-0 mb-3 text-base font-semibold">每个字段是谁给的</h2>
      <p class="mt-[-6px] mb-3 text-[13px] text-slate-500 dark:text-slate-400">
        合并规则是「最新的非空观测胜出」：同一字段被多个实例报过时，只取观测时间最新的那条；人工纠错优先级与实例相同，也按时间参与。
      </p>
      <FieldSourceTable :fields="detail.fields" />
    </div>

    <div :class="[card, 'mt-4']">
      <h2 class="mt-0 mb-3 text-base font-semibold">上报记录（{{ trendTotal }}）</h2>
      <ContributionList :contributions="contributions" />
      <Pager :page="trendPage" :page-size="trendPageSize" :total="trendTotal" @update:page="(value) => (trendPage = value)" />
    </div>
  </template>
</template>
