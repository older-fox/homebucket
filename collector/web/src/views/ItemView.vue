<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import ContributionList from '../components/ContributionList.vue';
import FieldSourceTable from '../components/FieldSourceTable.vue';
import Pager from '../components/Pager.vue';
import { api, errorMessage } from '../api';
import type { ContributionView, ItemDetail } from '../api';

const props = defineProps<{ barcode: string }>();

const detail = ref<ItemDetail | null>(null);
const contributions = ref<ContributionView[]>([]);
const trendTotal = ref(0);
const trendPage = ref(1);
const trendPageSize = 10;
const loading = ref(true);
const error = ref('');

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    detail.value = await api.item(props.barcode);
    trendPage.value = 1;
    await loadTrend();
  } catch (caught) {
    detail.value = null;
    contributions.value = [];
    error.value = errorMessage(caught);
  } finally {
    loading.value = false;
  }
}

async function loadTrend(): Promise<void> {
  try {
    const data = await api.itemContributions(props.barcode, trendPage.value, trendPageSize);
    contributions.value = data.contributions;
    trendTotal.value = data.total;
  } catch (caught) {
    error.value = errorMessage(caught);
  }
}

function shortTime(value: string): string {
  return value.replace('T', ' ').slice(0, 16);
}

watch(() => props.barcode, load);
watch(trendPage, () => void loadTrend());
onMounted(load);
</script>

<template>
  <div class="row">
    <RouterLink class="btn ghost tiny" to="/">← 返回查询</RouterLink>
  </div>

  <p v-if="error" class="notice error" style="margin-top: 14px">{{ error }}</p>
  <p v-else-if="loading" class="muted" style="margin-top: 14px">载入中…</p>

  <template v-if="detail">
    <div class="page-head" style="margin-top: 12px">
      <h1>{{ detail.name || '（还没有名称）' }}</h1>
      <span v-if="detail.barcode" class="chip mono">{{ detail.barcode }}</span>
      <span v-for="field in detail.lockedFields" :key="field" class="chip warn">{{ field }} 已锁定</span>
    </div>
    <p class="page-sub">
      {{ [detail.manufacturer, detail.model, detail.category].filter(Boolean).join(' · ') || '暂无厂商 / 型号 / 分类' }}
      · {{ detail.instanceCount }} 个实例上报过 {{ detail.contributionCount }} 次
      · 首次见到 {{ shortTime(detail.firstSeenAt) }}，最后更新 {{ shortTime(detail.updatedAt) }}
    </p>

    <div class="grid cols-2">
      <div class="card">
        <h2>资料</h2>
        <dl class="kv">
          <dt>身份键</dt><dd class="mono tiny">{{ detail.identityKey }}</dd>
          <dt>描述</dt><dd>{{ detail.description || '—' }}</dd>
          <dt>基础单位</dt><dd>{{ detail.baseUnit || '—' }}</dd>
          <dt>扩展属性</dt>
          <dd>
            <template v-if="Object.keys(detail.attributes).length > 0">
              <span v-for="(value, key) in detail.attributes" :key="key" class="chip tiny" style="margin: 0 4px 4px 0">
                {{ key }}: {{ value }}
              </span>
            </template>
            <span v-else class="muted">—</span>
          </dd>
        </dl>
      </div>

      <div class="card">
        <h2>图片（{{ detail.imageUrls.length }}）</h2>
        <div class="row tight">
          <img
            v-for="url in detail.imageUrls"
            :key="url"
            :src="url"
            alt="物品图片"
            style="width: 92px; height: 92px; object-fit: cover; border-radius: 8px; border: 1px solid var(--line)"
          />
        </div>
        <p v-if="detail.imageUrls.length === 0" class="muted small">还没有图片。</p>
      </div>
    </div>

    <div class="card">
      <h2>每个字段是谁给的</h2>
      <p class="small muted" style="margin-top: -6px">
        合并规则是「最新的非空观测胜出」：同一字段被多个实例报过时，只取观测时间最新的那条；人工纠错优先级与实例相同，也按时间参与。
      </p>
      <FieldSourceTable :fields="detail.fields" />
    </div>

    <div class="card">
      <h2>上报记录（{{ trendTotal }}）</h2>
      <ContributionList :contributions="contributions" />
      <Pager :page="trendPage" :page-size="trendPageSize" :total="trendTotal" @update:page="(value) => (trendPage = value)" />
    </div>
  </template>
</template>
