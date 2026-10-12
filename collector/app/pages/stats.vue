<script setup lang="ts">
import { computed } from 'vue';
import { capture, useApi } from '../composables/useApi';
import type { Loaded, StatsView } from '../composables/useApi';
import { tableCell, tableHead, tableWrap } from '~/utils/ui';

const api = useApi();
const { t } = useI18n();

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

function shortTime(value: string): string {
  return value.replace('T', ' ').slice(0, 16);
}

useHead({ title: computed(() => t('stats.title')) });

/**
 * 指标卡是里外两层结构：第一行是标签、第二行才是数字。
 * 这不是随意排的 —— 验收脚本按「标签\n数字」两行解析每张卡，顺序反了整张表都会读错。
 */
const statCard = 'hb-card hb-card-hover p-6';
const statLabel = 'text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400';
const statValue = 'mt-1.5 text-3xl font-semibold leading-tight tabular';
/** 第 4 张卡是时间戳（非纯数字），降一档字号但仍用等宽数字避免刷新时跳动 */
const statValueText = 'mt-1.5 text-2xl font-semibold leading-tight tabular';
const statHint = 'mt-1 text-xs text-gray-500 dark:text-gray-400';
</script>

<template>
  <div data-testid="page-head" class="flex flex-wrap items-baseline gap-3">
    <h1 class="m-0 text-2xl font-semibold tracking-tight">{{ t('stats.title') }}</h1>
  </div>
  <p class="mt-2 mb-6 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
    {{ t('stats.intro') }}
  </p>

  <AppNotice v-if="error" tone="error" data-testid="notice">{{ error }}</AppNotice>
  <p v-else-if="loading" class="m-0 text-sm text-gray-500 dark:text-gray-400">{{ t('common.loading') }}</p>

  <div v-if="stats" class="space-y-8">
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div :class="statCard" data-testid="stat">
        <div :class="statLabel">{{ t('stats.totals.items') }}</div>
        <div :class="statValue">{{ stats.totals.items }}</div>
        <div :class="statHint">{{ t('stats.totals.barcoded', { count: stats.totals.barcoded }) }}</div>
      </div>
      <div :class="statCard" data-testid="stat">
        <div :class="statLabel">{{ t('stats.totals.contributions') }}</div>
        <div :class="statValue">{{ stats.totals.contributions }}</div>
        <div :class="statHint">{{ t('stats.totals.contributionsHint') }}</div>
      </div>
      <div :class="statCard" data-testid="stat">
        <div :class="statLabel">{{ t('stats.totals.instances') }}</div>
        <div :class="statValue">{{ stats.totals.instances }}</div>
        <!-- reportingInstances 本身已是「{count} 个上报过」整句，不能再自己拼一次后缀 -->
        <div :class="statHint">{{ t('stats.totals.reportingInstances', { count: stats.totals.reportingInstances }) }}</div>
      </div>
      <div :class="statCard" data-testid="stat">
        <div :class="statLabel">{{ t('stats.totals.lastContribution') }}</div>
        <div :class="statValueText">
          {{ stats.totals.lastContributionAt ? shortTime(stats.totals.lastContributionAt) : t('stats.totals.none') }}
        </div>
        <div :class="statHint">{{ t('stats.totals.observedAt') }}</div>
      </div>
    </div>

    <AppCard :title="t('stats.coverage')" data-testid="card">
      <div class="grid gap-2.5">
        <div
          v-for="row in stats.coverage"
          :key="row.field"
          class="grid grid-cols-[110px_1fr_78px] items-center gap-2.5 text-sm max-sm:grid-cols-[84px_1fr_64px]"
        >
          <span class="truncate text-gray-700 dark:text-gray-300">{{ row.field }}</span>
          <!-- 进度条只做视觉冗余：数值本身就在右边，所以它可以是纯装饰 -->
          <span class="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <span class="block h-full rounded-full bg-blue-600" :style="{ width: `${row.percent}%` }" />
          </span>
          <span class="tabular text-xs text-gray-500 dark:text-gray-400">{{ t('stats.coverageValue', { filled: row.filled, percent: row.percent }) }}</span>
        </div>
      </div>
    </AppCard>

    <AppCard :title="t('stats.daily')" data-testid="card">
      <p v-if="stats.daily.length === 0" class="m-0 text-sm text-gray-500 dark:text-gray-400">{{ t('stats.dailyEmpty') }}</p>
      <template v-else>
        <!-- 柱子只有颜色和高度，读屏读不到数：把整句 tooltip 交给 title，并给容器一个组标签 -->
        <div class="flex h-[92px] items-end gap-[3px]" role="img" :aria-label="t('stats.ariaChart')">
          <span
            v-for="row in stats.daily"
            :key="row.date"
            class="min-h-[2px] flex-1 rounded-t-[3px] bg-blue-600/85"
            :style="{ height: `${Math.round((row.contributions / peak) * 100)}%` }"
            :title="t('stats.dailyTooltip', { date: row.date, count: row.contributions })"
          />
        </div>
        <div class="mt-1.5 flex gap-[3px]">
          <span v-for="row in stats.daily" :key="row.date" class="flex-1 text-center text-xs text-gray-500 dark:text-gray-400">
            {{ shortDate(row.date) }}
          </span>
        </div>
      </template>
    </AppCard>

    <div class="grid gap-4 sm:grid-cols-2">
      <AppCard :title="t('stats.topInstances')" data-testid="card">
        <div :class="tableWrap">
          <table class="w-full border-collapse">
            <thead>
              <tr>
                <th :class="tableHead">{{ t('stats.instancesHeader') }}</th>
                <th :class="[tableHead, 'text-right']">{{ t('stats.contributionsHeader') }}</th>
                <th :class="tableHead">{{ t('stats.lastSeen') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in stats.topInstances" :key="row.id">
                <td :class="[tableCell, 'font-medium']">{{ row.name }}</td>
                <td :class="[tableCell, 'tabular text-right']">{{ row.contributionCount }}</td>
                <td :class="[tableCell, 'whitespace-nowrap font-mono text-xs text-gray-500 dark:text-gray-400']">
                  {{ row.lastSeenAt ? shortTime(row.lastSeenAt) : t('common.empty') }}
                </td>
              </tr>
              <tr v-if="stats.topInstances.length === 0">
                <td :class="[tableCell, 'text-center text-gray-500 dark:text-gray-400']" colspan="3">{{ t('stats.noInstances') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </AppCard>

      <AppCard :title="t('stats.manufacturers')" data-testid="card">
        <div :class="tableWrap">
          <table class="w-full border-collapse">
            <thead>
              <tr>
                <th :class="tableHead">{{ t('stats.manufacturerHeader') }}</th>
                <th :class="[tableHead, 'text-right']">{{ t('stats.itemsHeader') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in stats.topManufacturers" :key="row.manufacturer">
                <td :class="tableCell">{{ row.manufacturer }}</td>
                <td :class="[tableCell, 'tabular text-right']">{{ row.items }}</td>
              </tr>
              <tr v-if="stats.topManufacturers.length === 0">
                <td :class="[tableCell, 'text-center text-gray-500 dark:text-gray-400']" colspan="2">{{ t('stats.noData') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div :class="[tableWrap, 'mt-3']">
          <table class="w-full border-collapse">
            <thead>
              <tr>
                <th :class="tableHead">{{ t('stats.categoryHeader') }}</th>
                <th :class="[tableHead, 'text-right']">{{ t('stats.itemsHeader') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in stats.topCategories" :key="row.category">
                <td :class="tableCell">{{ row.category }}</td>
                <td :class="[tableCell, 'tabular text-right']">{{ row.items }}</td>
              </tr>
              <tr v-if="stats.topCategories.length === 0">
                <td :class="[tableCell, 'text-center text-gray-500 dark:text-gray-400']" colspan="2">{{ t('stats.noData') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </AppCard>
    </div>
  </div>
</template>
