<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import ContributionList from '../components/ContributionList.vue';
import Pager from '../components/Pager.vue';
import { api, errorMessage } from '../api';
import type { AdminContribution } from '../api';
import { loadToken, session } from '../session';

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
</script>

<template>
  <div class="page-head">
    <h1>上报审计</h1>
    <span class="chip">共 {{ total }} 条</span>
  </div>
  <p class="page-sub">
    每一条上报都是不可改的流水。这里是"谁在什么时候报了什么"的完整账本 —— 屏蔽某条上报后，相关字段会立刻按剩余流水重算。
  </p>

  <p v-if="!session.token" class="notice warn">
    需要管理令牌：点右上角「管理令牌」填入服务端的 <code>COLLECTOR_ADMIN_TOKEN</code>。
  </p>

  <template v-else>
    <div class="card">
      <div class="grid cols-4">
        <label class="field">
          <span>来源</span>
          <select v-model="source" class="select" @change="applyFilters">
            <option value="">全部</option>
            <option value="api">实例上报</option>
            <option value="admin">人工纠错</option>
          </select>
        </label>
        <label class="field">
          <span>可见性</span>
          <select v-model="blocked" class="select" @change="applyFilters">
            <option value="">全部</option>
            <option value="visible">正常</option>
            <option value="blocked">已屏蔽</option>
          </select>
        </label>
        <label class="field">
          <span>物品 ID</span>
          <input v-model="itemId" class="input mono" inputmode="numeric" placeholder="如 12" @keyup.enter="applyFilters" />
        </label>
        <label class="field">
          <span>实例 ID</span>
          <input v-model="instanceId" class="input mono" inputmode="numeric" placeholder="如 3" @keyup.enter="applyFilters" />
        </label>
      </div>
      <div class="row" style="margin-top: 12px">
        <button class="btn" type="button" :disabled="loading" @click="applyFilters">应用筛选</button>
        <span class="spacer" />
        <span v-if="loading" class="muted small">载入中…</span>
      </div>
    </div>

    <p v-if="error" class="notice error" style="margin-top: 14px">{{ error }}</p>
    <p v-if="notice" class="notice ok" style="margin-top: 14px">{{ notice }}</p>

    <div style="margin-top: 16px">
      <ContributionList :contributions="entries" admin :busy-id="busyId" @toggle-block="toggleBlock" />
    </div>

    <Pager :page="page" :page-size="pageSize" :total="total" @update:page="(value) => { page = value; load(); }" />
  </template>
</template>
