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
        <span class="value">×{{ item.quantity }}</span>
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

    <section class="block">
      <h2>{{ t('item.units') }}</h2>
      <UnitEditor :item-id="item.id" :units="item.units" @changed="load" />
    </section>

    <section ref="editSection" class="block">
      <h2>{{ t('item.edit') }}</h2>
      <ItemForm :item-id="item.id" @saved="load" />
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
  </div>
</template>

<script setup lang="ts">
interface ItemDetail {
  id: number;
  name: string;
  quantity: number;
  price: number;
  createdAt: string;
  location: { id: number; name: string } | null;
  tags: { id: number; name: string; color: string }[];
  images: { id: number; url: string }[];
  qrToken: string;
  barcode: string | null;
  units: { id: number; sn: string | null; locationId: number | null; location: { id: number; name: string } | null }[];
}

const { t } = useI18n();
const api = useApi();
const route = useRoute();
const toast = useToast();
const { money, date } = useFormat();

const itemId = Number(route.params.id);
const item = ref<ItemDetail | null>(null);
const showQr = ref(false);
const qrUrl = ref('');

async function load() {
  item.value = await api.get<ItemDetail>(`/items/${itemId}`);
  if (showQr.value) await loadQr();
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
  await load();
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
  margin-bottom: 18px;
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

.block {
  margin-bottom: 22px;
}

h2 {
  margin: 0 0 10px;
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
