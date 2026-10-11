<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Pager from '../components/Pager.vue';
import { api, errorMessage } from '../api';
import type { ItemSummary } from '../api';

const route = useRoute();
const router = useRouter();

const keyword = ref(typeof route.query.q === 'string' ? route.query.q : '');
const page = ref(Number(route.query.page ?? 1) || 1);
const pageSize = 20;
const items = ref<ItemSummary[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref('');

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const data = await api.search(keyword.value.trim(), page.value, pageSize);
    items.value = data.items;
    total.value = data.total;
  } catch (caught) {
    items.value = [];
    total.value = 0;
    error.value = errorMessage(caught);
  } finally {
    loading.value = false;
  }
}

function submit(): void {
  page.value = 1;
  void router.replace({ query: { ...(keyword.value.trim() ? { q: keyword.value.trim() } : {}), page: undefined } });
  void load();
}

watch(page, (value) => {
  void router.replace({ query: { ...route.query, page: value > 1 ? String(value) : undefined } });
  void load();
});

watch(
  () => route.query.q,
  (value) => {
    const next = typeof value === 'string' ? value : '';
    if (next !== keyword.value) {
      keyword.value = next;
      void load();
    }
  },
);

onMounted(load);
</script>

<template>
  <div class="page-head">
    <h1>条码资料库</h1>
    <span class="chip">{{ total }} 条</span>
  </div>
  <p class="page-sub">
    所有 HomeBucket 实例共享的物品资料。输入完整条码可以直接跳到详情；输入关键词则搜索名称、型号、厂商、分类。
  </p>

  <form class="search-row" @submit.prevent="submit">
    <input
      v-model="keyword"
      class="input mono"
      type="search"
      placeholder="条码 / 名称 / 型号 / 厂商，例如 6901234567892"
      autofocus
    />
    <button class="btn" type="submit" :disabled="loading">{{ loading ? '查询中…' : '查询' }}</button>
  </form>

  <p v-if="error" class="notice error" style="margin-top: 14px">{{ error }}</p>

  <div class="item-list" style="margin-top: 16px">
    <RouterLink
      v-for="item in items"
      :key="item.id"
      class="item-row"
      :to="{ name: 'item', params: { barcode: item.barcode ?? String(item.id) } }"
    >
      <img v-if="item.imageUrls.length > 0" class="thumb" :src="item.imageUrls[0]" :alt="item.name ?? ''" />
      <span v-else class="thumb placeholder">📦</span>
      <span class="body">
        <span class="title">{{ item.name || '（还没有名称）' }}</span>
        <span class="meta">
          <template v-if="item.barcode"><span class="mono">{{ item.barcode }}</span> · </template>
          {{ [item.manufacturer, item.model, item.category].filter(Boolean).join(' · ') || '暂无厂商/型号/分类' }}
        </span>
        <span class="meta">
          {{ item.instanceCount }} 个实例上报过 · 共 {{ item.contributionCount }} 次 · 更新于
          {{ item.updatedAt.replace('T', ' ').slice(0, 16) }}
        </span>
      </span>
    </RouterLink>
  </div>

  <p v-if="!loading && items.length === 0 && !error" class="muted" style="margin-top: 16px">
    没有匹配的资料。换个关键词试试，或者等实例上报 —— 实例会在扫描条码时自动汇报。
  </p>

  <Pager :page="page" :page-size="pageSize" :total="total" @update:page="(value) => (page = value)" />
</template>
