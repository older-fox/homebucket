<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, errorMessage } from '../api';
import type { StatsView } from '../api';

const stats = ref<StatsView | null>(null);
const error = ref('');
const loading = ref(true);

const peak = computed(() => Math.max(1, ...(stats.value?.daily ?? []).map((row) => row.contributions)));

function shortDate(value: string): string {
  return value.slice(5);
}

onMounted(async () => {
  try {
    stats.value = await api.stats();
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="page-head">
    <h1>统计概览</h1>
  </div>
  <p class="page-sub">这个收集器上公共资料库的整体情况：覆盖度、上报趋势、贡献最多的实例与厂商。</p>

  <p v-if="error" class="notice error">{{ error }}</p>
  <p v-else-if="loading" class="muted">载入中…</p>

  <template v-if="stats">
    <div class="grid cols-4">
      <div class="stat">
        <div class="label">物品条目</div>
        <div class="value">{{ stats.totals.items }}</div>
        <div class="hint">其中 {{ stats.totals.barcoded }} 条有条码</div>
      </div>
      <div class="stat">
        <div class="label">有效上报</div>
        <div class="value">{{ stats.totals.contributions }}</div>
        <div class="hint">已排除被屏蔽的上报</div>
      </div>
      <div class="stat">
        <div class="label">实例</div>
        <div class="value">{{ stats.totals.instances }}</div>
        <div class="hint">{{ stats.totals.reportingInstances }} 个上报过</div>
      </div>
      <div class="stat">
        <div class="label">最近一次上报</div>
        <div class="value small" style="font-size: 15px; font-weight: 600">
          {{ stats.totals.lastContributionAt ? stats.totals.lastContributionAt.replace('T', ' ').slice(0, 16) : '还没有' }}
        </div>
        <div class="hint">观测时间（UTC）</div>
      </div>
    </div>

    <div class="card">
      <h2>字段覆盖度</h2>
      <div class="grid" style="gap: 10px">
        <div v-for="row in stats.coverage" :key="row.field" class="bar-row">
          <span class="name">{{ row.field }}</span>
          <span class="bar"><span :style="{ width: `${row.percent}%` }" /></span>
          <span class="muted tiny">{{ row.filled }} · {{ row.percent }}%</span>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>最近 14 天上报量</h2>
      <div class="spark">
        <div v-for="row in stats.daily" :key="row.date" :style="{ height: `${Math.round((row.contributions / peak) * 100)}%` }" :title="`${row.date}：${row.contributions} 次`" />
      </div>
      <div class="spark-x">
        <span v-for="row in stats.daily" :key="row.date">{{ shortDate(row.date) }}</span>
      </div>
    </div>

    <div class="grid cols-2" style="margin-top: 16px">
      <div class="card">
        <h2>贡献最多的实例</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>实例</th><th class="num">上报</th><th>最后出现</th></tr></thead>
            <tbody>
              <tr v-for="row in stats.topInstances" :key="row.id">
                <td>{{ row.name }}</td>
                <td class="num">{{ row.contributionCount }}</td>
                <td class="mono tiny">{{ row.lastSeenAt ? row.lastSeenAt.replace('T', ' ').slice(0, 16) : '—' }}</td>
              </tr>
              <tr v-if="stats.topInstances.length === 0"><td colspan="3" class="muted center">还没有实例上报</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h2>厂商 / 分类分布</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>厂商</th><th class="num">条目</th></tr></thead>
            <tbody>
              <tr v-for="row in stats.topManufacturers" :key="row.manufacturer">
                <td>{{ row.manufacturer }}</td>
                <td class="num">{{ row.items }}</td>
              </tr>
              <tr v-if="stats.topManufacturers.length === 0"><td colspan="2" class="muted center">暂无数据</td></tr>
            </tbody>
          </table>
        </div>
        <div class="table-wrap" style="margin-top: 12px">
          <table>
            <thead><tr><th>分类</th><th class="num">条目</th></tr></thead>
            <tbody>
              <tr v-for="row in stats.topCategories" :key="row.category">
                <td>{{ row.category }}</td>
                <td class="num">{{ row.items }}</td>
              </tr>
              <tr v-if="stats.topCategories.length === 0"><td colspan="2" class="muted center">暂无数据</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </template>
</template>
