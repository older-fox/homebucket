<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import ContributionList from '../components/ContributionList.vue';
import Pager from '../components/Pager.vue';
import { errorMessage, useApi } from '../composables/useApi';
import type { AdminContribution } from '../composables/useApi';
import { loadToken, session } from '../composables/useAdminToken';

const api = useApi();

const entries = ref<AdminContribution[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const source = ref('');
const blocked = ref('');
const itemId = ref('');
const instanceId = ref('');
const loading = ref(false);
const busyId = ref<number | null>(null);
const error = ref('');
const notice = ref('');

async function load(): Promise<void> {
  // 令牌在 localStorage：绝不在 SSR 期请求管理接口
  if (import.meta.server) return;
  if (!loadToken()) {
    entries.value = [];
    total.value = 0;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const data = await api.admin.contributions({
      page: page.value,
      pageSize,
      source: source.value || undefined,
      blocked: blocked.value === '' ? undefined : blocked.value === 'blocked',
      itemId: itemId.value ? Number(itemId.value) : undefined,
      instanceId: instanceId.value ? Number(instanceId.value) : undefined,
    });
    entries.value = data.contributions;
    total.value = data.total;
  } catch (caught) {
    entries.value = [];
    total.value = 0;
    error.value = errorMessage(caught);
  } finally {
    loading.value = false;
  }
}

async function toggleBlock(entry: AdminContribution): Promise<void> {
  busyId.value = entry.id;
  notice.value = '';
  error.value = '';
  try {
    const result = await api.admin.blockContribution(
      entry.id,
      !entry.blocked,
      entry.blocked ? undefined : '人工判定为错误上报',
    );
    notice.value = `${entry.blocked ? '已恢复' : '已屏蔽'}上报 #${entry.id}，物品「${result.item.name ?? result.item.id}」现已重算`;
    await load();
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    busyId.value = null;
  }
}

function applyFilters(): void {
  page.value = 1;
  void load();
}

onMounted(async () => {
  loadToken();
  await load();
});

// 令牌是在顶栏弹窗里补的：填完立刻把数据拉出来，不必手动刷新页面
watch(
  () => session.token,
  (token) => {
    if (token && entries.value.length === 0) void load();
  },
);

useHead({ title: '上报审计' });

const card = 'rounded-[10px] border border-slate-200 bg-white p-[18px] shadow-sm dark:border-slate-800 dark:bg-slate-900';
const input =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-brand-700/40';
const label = 'block text-[12.5px] text-slate-500 dark:text-slate-400';
const primaryButton =
  'inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50';
const warnNotice = 'rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2.5 text-[13.5px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
const errorNotice = 'mt-3.5 rounded-lg border border-red-500/30 bg-red-50 px-3 py-2.5 text-[13.5px] text-red-700 dark:bg-red-500/10 dark:text-red-300';
const okNotice = 'mt-3.5 rounded-lg border border-emerald-500/30 bg-emerald-50 px-3 py-2.5 text-[13.5px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
</script>

<template>
  <div class="flex flex-wrap items-baseline gap-3" data-testid="page-head">
    <h1 class="m-0 text-2xl font-bold">上报审计</h1>
    <span class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
      共 {{ total }} 条
    </span>
  </div>
  <p class="m-0 mb-4 text-[13.5px] text-slate-500 dark:text-slate-400">
    每一条上报都是不可改的流水。这里是"谁在什么时候报了什么"的完整账本 —— 屏蔽某条上报后，相关字段会立刻按剩余流水重算。
  </p>

  <p v-if="!session.token" :class="warnNotice" data-testid="notice">
    需要管理令牌：点右上角「管理令牌」填入服务端的 <code class="font-mono">COLLECTOR_ADMIN_TOKEN</code>。
  </p>

  <template v-else>
    <div :class="card" data-testid="card">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label class="block">
          <span :class="label">来源</span>
          <select v-model="source" :class="input" data-testid="audit-source" @change="applyFilters">
            <option value="">全部</option>
            <option value="api">实例上报</option>
            <option value="admin">人工纠错</option>
          </select>
        </label>
        <label class="block">
          <span :class="label">可见性</span>
          <select v-model="blocked" :class="input" data-testid="audit-visibility" @change="applyFilters">
            <option value="">全部</option>
            <option value="visible">正常</option>
            <option value="blocked">已屏蔽</option>
          </select>
        </label>
        <label class="block">
          <span :class="label">物品 ID</span>
          <input
            v-model="itemId"
            :class="[input, 'font-mono']"
            data-testid="audit-item-id"
            inputmode="numeric"
            placeholder="如 12"
            @keyup.enter="applyFilters"
          />
        </label>
        <label class="block">
          <span :class="label">实例 ID</span>
          <input
            v-model="instanceId"
            :class="[input, 'font-mono']"
            data-testid="audit-instance-id"
            inputmode="numeric"
            placeholder="如 3"
            @keyup.enter="applyFilters"
          />
        </label>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-2.5">
        <button :class="primaryButton" data-testid="audit-apply" type="button" :disabled="loading" @click="applyFilters">
          应用筛选
        </button>
        <span class="flex-1" />
        <span v-if="loading" class="text-[13px] text-slate-500 dark:text-slate-400">载入中…</span>
      </div>
    </div>

    <p v-if="error" :class="errorNotice" data-testid="notice">{{ error }}</p>
    <p v-if="notice" :class="okNotice" data-testid="notice">{{ notice }}</p>

    <div class="mt-4">
      <ContributionList :contributions="entries" admin :busy-id="busyId" @toggle-block="toggleBlock" />
    </div>

    <Pager
      :page="page"
      :page-size="pageSize"
      :total="total"
      @update:page="
        (value) => {
          page = value;
          load();
        }
      "
    />
  </template>
</template>
