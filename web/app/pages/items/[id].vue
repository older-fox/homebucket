<template>
  <div v-if="item">
    <PageHeader
      :title="item.name"
      :description="item.location?.name || t('item.noLocation')"
      back="/items"
      :back-label="t('item.title')"
    >
      <template #actions>
        <UButton color="neutral" variant="soft" icon="i-lucide-qr-code" class="hb-tap" @click="showQr = true">
          <span class="hide-sm">{{ t('item.qrCode') }}</span>
        </UButton>
        <UButton color="error" variant="soft" icon="i-lucide-trash-2" class="hb-tap" @click="remove">
          <span class="hide-sm">{{ t('common.delete') }}</span>
        </UButton>
      </template>
    </PageHeader>

    <div class="meta hb-card">
      <div class="meta-item">
        <span class="label">{{ t('item.quantity') }}</span>
        <span class="value">×{{ formatUnits(item.quantity, item.baseUnit, item.packLevels) }}</span>
      </div>
      <div class="meta-item">
        <span class="label">{{ t('item.price') }}</span>
        <span class="value">{{ money(item.price) }}</span>
      </div>
      <div class="meta-item">
        <span class="label">{{ t('item.totalPrice') }}</span>
        <span class="value">{{ money(item.price * item.quantity) }}</span>
      </div>
      <div class="meta-item">
        <span class="label">{{ t('common.created') }}</span>
        <span class="value">{{ date(item.createdAt) }}</span>
      </div>
      <div v-if="item.barcode" class="meta-item">
        <span class="label">{{ t('item.barcode') }}</span>
        <span class="value hb-mono hb-break">{{ item.barcode }}</span>
      </div>
      <div v-if="item.traceCode" class="meta-item">
        <span class="label">{{ t('item.traceCode') }}</span>
        <span class="value hb-mono hb-break">{{ item.traceCode }}</span>
      </div>
      <div class="meta-item">
        <span class="label">{{ t('item.tags') }}</span>
        <span class="value">
          <span v-for="tag in item.tags" :key="tag.id" class="tag" :style="{ color: tag.color, borderColor: tag.color }">
            {{ tag.name }}
          </span>
          <span v-if="!item.tags.length" class="muted">{{ t('item.noTags') }}</span>
        </span>
      </div>
    </div>

    <div class="stock-actions">
      <UButton color="primary" variant="soft" icon="i-lucide-minus" @click="openAdjust('consume')">
        {{ t('item.consume') }}
      </UButton>
      <UButton color="success" variant="soft" icon="i-lucide-plus" @click="openAdjust('restock')">
        {{ t('item.restock') }}
      </UButton>
      <UButton
        v-if="packaged"
        color="neutral"
        variant="soft"
        icon="i-lucide-box-open"
        :title="t('item.unpackHint')"
        @click="unpack"
      >
        {{ t('item.unpack') }}
      </UButton>
    </div>

    <section class="block">
      <h2>{{ t('item.units') }}</h2>
      <UnitEditor :item-id="item.id" :units="item.units" @changed="reload" />
    </section>

    <section ref="editSection" class="block">
      <h2>{{ t('item.edit') }}</h2>
      <ItemForm :item-id="item.id" @saved="reload" />
    </section>

    <section class="block">
      <h2>{{ t('history.title') }}</h2>
      <ListSkeleton v-if="historyLoading" :rows="3" />
      <template v-else-if="history.length">
        <ActivityTimeline :entries="history" />
        <ListPager
          :page="historyPage"
          :total="historyTotal"
          :page-size="historyPageSize"
          @update:page="onHistoryPage"
        />
      </template>
      <EmptyState v-else :text="t('history.empty')" icon="i-lucide-history" />
    </section>

    <UModal v-model:open="showQr" :title="t('item.qrCode')">
      <template #body>
        <div class="qr-box">
          <img v-if="qrUrl" :src="qrUrl" :alt="t('item.qrCode')" />
          <p v-else class="muted">{{ t('common.loading') }}</p>
          <UButton color="neutral" variant="soft" icon="i-lucide-printer" @click="printQr">
            {{ t('item.printQr') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <StockAdjustDialog
      v-if="item"
      v-model:open="adjustOpen"
      :item-id="itemId"
      :base-unit="item.baseUnit"
      :pack-levels="item.packLevels"
      :mode="adjustMode"
      @done="reload"
    />
  </div>
</template>

<script setup lang="ts">
import type { ActivityEntry, ActivityPage } from '~/types/activity';

interface ItemDetail {
  id: number;
  name: string;
  quantity: number;
  baseUnit: string | null;
  packLevels: { name: string; factor: number }[];
  price: number;
  createdAt: string;
  location: { id: number; name: string } | null;
  tags: { id: number; name: string; color: string }[];
  images: { id: number; url: string }[];
  qrToken: string;
  barcode: string | null;
  traceCode: string | null;
  units: { id: number; sn: string | null; locationId: number | null; location: { id: number; name: string } | null }[];
}

const { t } = useI18n();
const api = useApi();
const route = useRoute();
const toast = useToast();
const { money, date } = useFormat();
const { format: formatUnits } = useUnits();

const itemId = Number(route.params.id);
const item = ref<ItemDetail | null>(null);
const showQr = ref(false);
const qrUrl = ref('');

const adjustOpen = ref(false);
const adjustMode = ref<'consume' | 'restock'>('consume');
const packaged = computed(
  () => Boolean(item.value?.baseUnit) || (item.value?.packLevels?.length ?? 0) > 0,
);

function openAdjust(mode: 'consume' | 'restock') {
  adjustMode.value = mode;
  adjustOpen.value = true;
}

/** 拆箱：只留痕、不改库存（库存按最小单位，箱/散自动换算） */
async function unpack() {
  try {
    await api.post(`/items/${itemId}/unpack`, {});
    toast.add({ title: t('item.unpackDone'), color: 'success' });
    await reload();
  } catch (error) {
    toast.add({ title: (error as { message?: string }).message ?? t('errors.unknown'), color: 'error' });
  }
}

const history = ref<ActivityEntry[]>([]);
const historyTotal = ref(0);
const historyPage = ref(1);
const historyPageSize = 10;
const historyLoading = ref(true);

async function load() {
  item.value = await api.get<ItemDetail>(`/items/${itemId}`);
  if (showQr.value) await loadQr();
}

async function loadHistory() {
  historyLoading.value = true;
  try {
    const res = await api.get<ActivityPage>(`/items/${itemId}/history`, {
      page: historyPage.value,
      pageSize: historyPageSize,
    });
    history.value = res.items;
    historyTotal.value = res.total;
  } finally {
    historyLoading.value = false;
  }
}

/** 物品或 SN 变动后，详情与历史一起刷新 */
async function reload() {
  await Promise.all([load(), loadHistory()]);
}

function onHistoryPage(next: number) {
  historyPage.value = next;
  void loadHistory();
}

async function loadQr() {
  // 二维码接口需要 JWT，用 fetch 拿 SVG 文本再转 blob
  try {
    const response = await api.request<string>(`/items/${itemId}/qrcode.svg`, { responseType: 'text' });
    qrUrl.value = URL.createObjectURL(new Blob([response as unknown as string], { type: 'image/svg+xml' }));
  } catch {
    qrUrl.value = '';
  }
}

watch(showQr, (open) => {
  if (open) void loadQr();
});

function printQr() {
  if (!qrUrl.value) return;
  const win = window.open('', '_blank');
  win?.document.write(`<img src="${qrUrl.value}" onload="window.print()" style="width:320px" />`);
  win?.document.close();
}

async function remove() {
  if (!window.confirm(t('item.deleteConfirm', { name: item.value?.name ?? '' }))) return;
  try {
    await api.del(`/items/${itemId}`);
    toast.add({ title: t('common.deleted'), color: 'success' });
    await navigateTo('/items');
  } catch (error) {
    toast.add({ title: (error as { message?: string }).message ?? t('errors.unknown'), color: 'error' });
  }
}

const editSection = ref<HTMLElement | null>(null);

onMounted(async () => {
  await reload();
  // 从扫码「编辑物品」进来（?edit=1）：滚动到编辑区块
  if (route.query.edit === '1') {
    await nextTick();
    editSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});
</script>

<style scoped>
.meta {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: var(--hb-gap-lg);
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.label {
  font-size: var(--hb-fs-xs);
  color: var(--hb-muted);
}

.value {
  font-weight: var(--hb-fw-semibold);
}

/* 区块之间统一的垂直节奏：与 meta 卡片使用同一个间距 token，
   避免出现 18px / 22px 这种各写各的边距 */
.block {
  margin-bottom: var(--hb-gap-lg);
}

h2 {
  margin: 0 0 12px;
  font-size: var(--hb-fs-h3);
  font-weight: var(--hb-fw-semibold);
}

.tag {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 8px;
  border: 1px solid;
  border-radius: 999px;
  font-size: var(--hb-fs-xs);
}

.muted {
  color: var(--hb-muted);
  font-size: var(--hb-fs-sm);
}

.qr-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.qr-box img {
  width: 240px;
  height: 240px;
}

.stock-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: var(--hb-gap-lg);
}

@media (min-width: 768px) {
  .meta {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (max-width: 767px) {
  .hide-sm {
    display: none;
  }
}
</style>
