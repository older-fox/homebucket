<script setup lang="ts">
import { computed } from 'vue';
import { capture, useApi } from '../composables/useApi';
import type { Loaded, StatsView } from '../composables/useApi';

const api = useApi();

const { data, pending } = await useAsyncData<Loaded<StatsView>>(
  'stats',
  () => capture(() => api.stats()),
  { default: (): Loaded<StatsView> => ({ data: null, error: '', status: 0 }) },
);

const stats = computed(() => data.value?.data ?? null);
const error = computed(() => data.value?.error ?? '');
const loading = computed(() => pending.value);
const peak = computed(() => Math.max(1, ...(stats.value?.daily ?? []).map((row) => row.contributions)));

function shortDate(value: string): string {
  return value.slice(5);
}

useHead({ title: '统计概览' });

const card = 'rounded-[10px] border border-slate-200 bg-white p-[18px] shadow-sm dark:border-slate-800 dark:bg-slate-900';
const statCard = 'rounded-[10px] border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900';
const tableWrap = 'w-full max-w-full overflow-x-auto rounded-[10px] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';
const tableHead = 'whitespace-nowrap bg-slate-100 px-3 py-2 text-left text-[13.5px] font-semibold text-slate-600 dark:bg-slate-800/70 dark:text-slate-300';
const tableCell = 'border-b border-slate-200 px-3 py-2 align-top text-[13.5px] dark:border-slate-800';
const errorNotice = 'rounded-lg border border-red-500/30 bg-red-50 px-3 py-2.5 text-[13.5px] text-red-700 dark:bg-red-500/10 dark:text-red-300';
</script>

<template>
  <div class="flex flex-wrap items-baseline gap-3" data-testid="page-head">
    <h1 class="m-0 text-2xl font-bold">统计概览</h1>
  </div>
  <p class="m-0 mb-4 text-[13.5px] text-slate-500 dark:text-slate-400">
    这个收集器上公共资料库的整体情况：覆盖度、上报趋势、贡献最多的实例与厂商。
  </p>

  <p v-if="error" :class="errorNotice" data-testid="notice">{{ error }}</p>
  <p v-else-if="loading" class="text-slate-500 dark:text-slate-400">载入中…</p>

  <template v-if="stats">
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div :class="statCard" data-testid="stat">
        <div class="text-[12.5px] text-slate-500 dark:text-slate-400">物品条目</div>
        <div class="text-[26px] font-bold leading-tight">{{ stats.totals.items }}</div>
        <div class="text-xs text-slate-500 dark:text-slate-400">其中 {{ stats.totals.barcoded }} 条有条码</div>
      </div>
      <div :class="statCard" data-testid="stat">
        <div class="text-[12.5px] text-slate-500 dark:text-slate-400">有效上报</div>
        <div class="text-[26px] font-bold leading-tight">{{ stats.totals.contributions }}</div>
        <div class="text-xs text-slate-500 dark:text-slate-400">已排除被屏蔽的上报</div>
      </div>
      <div :class="statCard" data-testid="stat">
        <div class="text-[12.5px] text-slate-500 dark:text-slate-400">实例</div>
        <div class="text-[26px] font-bold leading-tight">{{ stats.totals.instances }}</div>
        <div class="text-xs text-slate-500 dark:text-slate-400">{{ stats.totals.reportingInstances }} 个上报过</div>
      </div>
      <div :class="statCard" data-testid="stat">
        <div class="text-[12.5px] text-slate-500 dark:text-slate-400">最近一次上报</div>
        <div class="text-[15px] font-semibold leading-tight">
          {{ stats.totals.lastContributionAt ? stats.totals.lastContributionAt.replace('T', ' ').slice(0, 16) : '还没有' }}
        </div>
        <div class="text-xs text-slate-500 dark:text-slate-400">观测时间（UTC）</div>
      </div>
    </div>

    <div :class="[card, 'mt-4']" data-testid="card">
      <h2 class="mt-0 mb-3 text-base font-semibold">字段覆盖度</h2>
      <div class="grid gap-2.5">
        <div
          v-for="row in stats.coverage"
          :key="row.field"
          class="grid grid-cols-[110px_1fr_78px] items-center gap-2.5 text-[13px] max-sm:grid-cols-[84px_1fr_64px]"
        >
          <span class="text-slate-600 dark:text-slate-300">{{ row.field }}</span>
          <span class="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <span class="block h-full bg-brand-500" :style="{ width: `${row.percent}%` }" />
          </span>
          <span class="text-xs text-slate-500 dark:text-slate-400">{{ row.filled }} · {{ row.percent }}%</span>
        </div>
      </div>
    </div>

    <div :class="[card, 'mt-4']" data-testid="card">
      <h2 class="mt-0 mb-3 text-base font-semibold">最近 14 天上报量</h2>
      <div class="flex h-[92px] items-end gap-[3px]">
        <div
          v-for="row in stats.daily"
          :key="row.date"
          class="min-h-[2px] flex-1 rounded-t-[3px] bg-brand-500 opacity-[0.85]"
          :style="{ height: `${Math.round((row.contributions / peak) * 100)}%` }"
          :title="`${row.date}：${row.contributions} 次`"
        />
      </div>
      <div class="mt-1.5 flex gap-[3px]">
        <span v-for="row in stats.daily" :key="row.date" class="flex-1 text-center text-[10px] text-slate-500 dark:text-slate-400">
          {{ shortDate(row.date) }}
        </span>
      </div>
    </div>

    <div class="mt-4 grid gap-3 sm:grid-cols-2">
      <div :class="card" data-testid="card">
        <h2 class="mt-0 mb-3 text-base font-semibold">贡献最多的实例</h2>
        <div :class="tableWrap">
          <table class="w-full border-collapse text-[13.5px]">
            <thead>
              <tr>
                <th :class="tableHead">实例</th>
                <th :class="[tableHead, 'text-right']">上报</th>
                <th :class="tableHead">最后出现</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in stats.topInstances" :key="row.id">
                <td :class="tableCell">{{ row.name }}</td>
                <td :class="[tableCell, 'text-right tabular-nums']">{{ row.contributionCount }}</td>
                <td :class="[tableCell, 'whitespace-nowrap font-mono text-xs']">
                  {{ row.lastSeenAt ? row.lastSeenAt.replace('T', ' ').slice(0, 16) : '—' }}
                </td>
              </tr>
              <tr v-if="stats.topInstances.length === 0">
                <td :class="[tableCell, 'text-center text-slate-500 dark:text-slate-400']" colspan="3">还没有实例上报</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div :class="card" data-testid="card">
        <h2 class="mt-0 mb-3 text-base font-semibold">厂商 / 分类分布</h2>
        <div :class="tableWrap">
          <table class="w-full border-collapse text-[13.5px]">
            <thead>
              <tr>
                <th :class="tableHead">厂商</th>
                <th :class="[tableHead, 'text-right']">条目</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in stats.topManufacturers" :key="row.manufacturer">
                <td :class="tableCell">{{ row.manufacturer }}</td>
                <td :class="[tableCell, 'text-right tabular-nums']">{{ row.items }}</td>
              </tr>
              <tr v-if="stats.topManufacturers.length === 0">
                <td :class="[tableCell, 'text-center text-slate-500 dark:text-slate-400']" colspan="2">暂无数据</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div :class="[tableWrap, 'mt-3']">
          <table class="w-full border-collapse text-[13.5px]">
            <thead>
              <tr>
                <th :class="tableHead">分类</th>
                <th :class="[tableHead, 'text-right']">条目</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in stats.topCategories" :key="row.category">
                <td :class="tableCell">{{ row.category }}</td>
                <td :class="[tableCell, 'text-right tabular-nums']">{{ row.items }}</td>
              </tr>
              <tr v-if="stats.topCategories.length === 0">
                <td :class="[tableCell, 'text-center text-slate-500 dark:text-slate-400']" colspan="2">暂无数据</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </template>
</template>
