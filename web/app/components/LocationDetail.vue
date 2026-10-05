<template>
  <div class="detail" :class="{ 'is-mobile': mobile }">
    <!-- 头部：名称 / 面包屑 / 操作 -->
    <div class="detail-head">
      <NuxtLink v-if="back && mobile" to="/locations" class="back hb-tap" :aria-label="t('common.back')">
        <UIcon name="i-lucide-arrow-left" />
      </NuxtLink>
      <div class="head-main">
        <h2 class="hb-h3">{{ data?.location.name ?? t('location.title') }}</h2>
        <p v-if="crumb" class="hb-muted crumb">{{ crumb }}</p>
      </div>
      <div class="head-actions">
        <UButton
          color="neutral"
          variant="soft"
          size="sm"
          icon="i-lucide-qr-code"
          class="hb-tap"
          :aria-label="t('location.qrCode')"
          @click="emit('qr')"
        />
        <UButton
          color="neutral"
          variant="soft"
          size="sm"
          icon="i-lucide-pencil"
          class="hb-tap"
          :aria-label="t('common.edit')"
          @click="emit('edit')"
        />
        <UButton size="sm" icon="i-lucide-folder-plus" class="hb-tap" @click="emit('createChild')">
          <span v-if="!mobile">{{ t('location.newChild') }}</span>
        </UButton>
      </div>
    </div>

    <div class="detail-body">
      <div v-if="pending" class="pad">
        <div v-for="n in 5" :key="n" class="hb-skeleton row-skeleton" />
      </div>

      <template v-else-if="data">
        <img v-if="data.location.imageUrl" :src="data.location.imageUrl" class="cover" :alt="data.location.name" />
        <p v-if="data.location.description" class="hb-muted desc">{{ data.location.description }}</p>

        <!-- 子位置 -->
        <section v-if="children.length">
          <h3 class="hb-section-title">
            <UIcon name="i-lucide-folder" />
            {{ t('location.subLocations') }}
            <span class="hb-muted hb-num">{{ children.length }}</span>
          </h3>
          <ul v-if="mobile" class="rows">
            <li v-for="child in children" :key="child.id" class="row hb-tap" @click="openChild(child.id)">
              <span class="hb-icon-tile small"><UIcon name="i-lucide-folder" /></span>
              <span class="row-main">
                <span class="row-title">{{ child.name }}</span>
                <span class="row-sub">
                  {{ t('location.itemCount', { count: child.itemCount }) }}
                  <template v-if="child.childCount"> · {{ t('location.childCount', { count: child.childCount }) }}</template>
                </span>
              </span>
              <UIcon name="i-lucide-chevron-right" class="chev" />
            </li>
          </ul>
          <div v-else class="grid">
            <button v-for="child in children" :key="child.id" type="button" class="mini hb-tap" @click="openChild(child.id)">
              <UIcon name="i-lucide-folder" />
              <span class="mini-name">{{ child.name }}</span>
              <span class="mini-count hb-num">{{ child.itemCount }}</span>
            </button>
          </div>
        </section>

        <!-- 物品 -->
        <section>
          <h3 class="hb-section-title">
            <UIcon name="i-lucide-package" />
            {{ t('location.directItems') }}
            <span class="hb-muted hb-num">{{ data.items.length }}</span>
          </h3>

          <EmptyState v-if="!data.items.length" :text="t('location.emptyContent')" icon="i-lucide-package" />

          <!-- 移动端：大行卡片 -->
          <ul v-else-if="mobile" class="rows">
            <li v-for="item in pagedItems" :key="item.id" class="row item-row" @click="navigateTo(`/items/${item.id}`)">
              <span class="hb-icon-tile small"><UIcon name="i-lucide-package" /></span>
              <span class="row-main">
                <span class="row-title">{{ item.name }}</span>
                <span class="row-sub">
                  {{ item.location?.name || t('item.noLocation') }}
                  <template v-if="item.model"> · {{ item.model }}</template>
                </span>
                <span class="row-meta">
                  <span class="hb-chip tiny hb-num">×{{ item.quantity }}</span>
                  <span v-if="item.unitCount" class="hb-chip tiny hb-num">{{ item.unitCount }} SN</span>
                </span>
              </span>
              <span class="row-side hb-num">{{ money(item.price * item.quantity) }}</span>
            </li>
          </ul>

          <!-- 桌面端：表格 -->
          <div v-else class="sub-pane">
            <table class="hb-table">
              <thead>
                <tr>
                  <th>{{ t('item.name') }}</th>
                  <th class="num">{{ t('item.quantity') }}</th>
                  <th>{{ t('item.location') }}</th>
                  <th class="num">{{ t('item.totalPrice') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in pagedItems" :key="item.id" class="clickable" @click="navigateTo(`/items/${item.id}`)">
                  <td class="strong">
                    {{ item.name }}
                    <span v-if="item.unitCount" class="hb-chip tiny hb-num">{{ item.unitCount }} SN</span>
                  </td>
                  <td class="num hb-num">{{ item.quantity }}</td>
                  <td class="hb-muted">{{ item.location?.name || t('item.noLocation') }}</td>
                  <td class="num hb-num">{{ money(item.price * item.quantity) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="data.items.length > pageSize" class="pager">
            <UButton color="neutral" variant="soft" size="sm" :disabled="itemPage <= 1" @click="itemPage -= 1">
              {{ t('common.prev') }}
            </UButton>
            <span class="hb-muted hb-num">{{ itemPage }} / {{ Math.ceil(data.items.length / pageSize) }}</span>
            <UButton
              color="neutral"
              variant="soft"
              size="sm"
              :disabled="itemPage >= Math.ceil(data.items.length / pageSize)"
              @click="itemPage += 1"
            >
              {{ t('common.next') }}
            </UButton>
          </div>
        </section>

        <!-- 序列号 -->
        <section v-if="data.itemUnits.length">
          <h3 class="hb-section-title">
            <UIcon name="i-lucide-barcode" />
            {{ t('location.unitsHere') }}
            <span class="hb-muted hb-num">{{ data.itemUnits.length }}</span>
          </h3>

          <ul v-if="mobile" class="rows">
            <li v-for="unit in pagedUnits" :key="unit.id" class="row" @click="navigateTo(`/items/${unit.itemId}`)">
              <span class="row-main">
                <span class="row-title hb-mono">{{ unit.sn || '—' }}</span>
                <span class="row-sub">{{ unit.itemName }} · {{ unit.locationName || t('item.noLocation') }}</span>
              </span>
              <UIcon name="i-lucide-chevron-right" class="chev" />
            </li>
          </ul>

          <div v-else class="sub-pane">
            <table class="hb-table">
              <thead>
                <tr>
                  <th>{{ t('item.sn') }}</th>
                  <th>{{ t('item.name') }}</th>
                  <th>{{ t('item.unitLocation') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="unit in pagedUnits" :key="unit.id" class="clickable" @click="navigateTo(`/items/${unit.itemId}`)">
                  <td class="hb-mono">{{ unit.sn || '—' }}</td>
                  <td>{{ unit.itemName }}</td>
                  <td class="hb-muted">{{ unit.locationName || t('item.noLocation') }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="data.itemUnits.length > pageSize" class="pager">
            <UButton color="neutral" variant="soft" size="sm" :disabled="unitPage <= 1" @click="unitPage -= 1">
              {{ t('common.prev') }}
            </UButton>
            <span class="hb-muted hb-num">{{ unitPage }} / {{ Math.ceil(data.itemUnits.length / pageSize) }}</span>
            <UButton
              color="neutral"
              variant="soft"
              size="sm"
              :disabled="unitPage >= Math.ceil(data.itemUnits.length / pageSize)"
              @click="unitPage += 1"
            >
              {{ t('common.next') }}
            </UButton>
          </div>
        </section>
      </template>

      <EmptyState v-else :text="t('location.emptyContent')" icon="i-lucide-mouse-pointer-click" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TreeNode } from '~/types/location';

interface Contents {
  location: {
    id: number;
    name: string;
    description: string | null;
    imageUrl: string | null;
    breadcrumb?: { id: number; name: string }[];
  };
  locations: TreeNode[];
  items: {
    id: number;
    name: string;
    quantity: number;
    price: number;
    model: string | null;
    location: { id: number; name: string } | null;
    unitCount: number;
  }[];
  itemUnits: { id: number; sn: string | null; itemId: number; itemName: string; locationName: string | null }[];
}

const props = withDefaults(defineProps<{ id: number; mobile?: boolean; back?: boolean }>(), {
  mobile: false,
  back: false,
});
const emit = defineEmits<{ edit: []; createChild: []; qr: []; select: [number] }>();

const { t } = useI18n();
const api = useApi();
const { money } = useFormat();

const data = ref<Contents | null>(null);
const pending = ref(true);
const itemPage = ref(1);
const unitPage = ref(1);

const pageSize = computed(() => (props.mobile ? 12 : 20));
const crumb = computed(() => data.value?.location.breadcrumb?.map((row) => row.name).join(' / ') ?? '');
const children = computed(() => (data.value?.locations ?? []).filter((row) => row.id !== props.id));

const pagedItems = computed(() => {
  const rows = data.value?.items ?? [];
  return rows.slice((itemPage.value - 1) * pageSize.value, itemPage.value * pageSize.value);
});

const pagedUnits = computed(() => {
  const rows = data.value?.itemUnits ?? [];
  return rows.slice((unitPage.value - 1) * pageSize.value, unitPage.value * pageSize.value);
});

async function load() {
  pending.value = true;
  try {
    data.value = await api.get<Contents>(`/locations/${props.id}/contents`);
    itemPage.value = 1;
    unitPage.value = 1;
  } finally {
    pending.value = false;
  }
}

/** 移动端：子位置要么继续钻取（本页复用），要么交给页面决定 */
function openChild(id: number) {
  emit('select', id);
}

watch(() => props.id, load);
onMounted(load);

defineExpose({ refresh: load });
</script>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.detail-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--hb-border);
  flex-shrink: 0;
}

.head-main {
  flex: 1;
  min-width: 0;
}

.crumb {
  margin: 2px 0 0;
  font-size: var(--hb-fs-xs);
}

h2 {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.head-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--hb-r-full);
  color: var(--hb-brand);
  flex-shrink: 0;
}

.back:hover {
  background: var(--hb-brand-soft);
}

.detail-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

h3.hb-section-title {
  margin: 10px 0 6px;
  font-size: var(--hb-fs-h3);
}

.cover {
  width: 100%;
  max-height: 180px;
  object-fit: cover;
  border-radius: var(--hb-r-md);
}

.desc {
  margin: 0;
  font-size: var(--hb-fs-sm);
}

.pad {
  padding: 4px 0;
}

.row-skeleton {
  height: 44px;
  margin-bottom: 8px;
}

/* 移动端：大行卡片（触控 >= 56px），列表不挤 */
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--hb-border);
  border-radius: var(--hb-r-md);
  overflow: hidden;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border-bottom: 1px solid var(--hb-border);
  cursor: pointer;
  min-height: 64px;
}

.row:last-child {
  border-bottom: 0;
}

.row:active {
  background: var(--hb-surface-2);
}

.item-row {
  align-items: flex-start;
}

.hb-icon-tile.small {
  width: 38px;
  height: 38px;
}

.hb-icon-tile.small :deep(svg) {
  width: 19px;
  height: 19px;
}

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.row-title {
  font-size: var(--hb-fs-body);
  font-weight: var(--hb-fw-semibold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-sub {
  font-size: var(--hb-fs-sm);
  color: var(--hb-muted);
}

.row-meta {
  display: flex;
  gap: 6px;
  margin-top: 2px;
}

.row-side {
  flex-shrink: 0;
  font-size: var(--hb-fs-body);
  font-weight: var(--hb-fw-semibold);
}

.chev {
  width: 18px;
  height: 18px;
  color: var(--hb-muted);
  flex-shrink: 0;
}

/* 桌面端子位置卡片 */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}

.mini {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 12px;
  min-height: 40px;
  border: 1px solid var(--hb-border);
  border-radius: var(--hb-r-md);
  background: var(--hb-surface);
  color: var(--hb-text);
  font-size: var(--hb-fs-sm);
  cursor: pointer;
  text-align: left;
}

.mini:hover {
  border-color: var(--hb-border-strong);
  background: var(--hb-surface-2);
}

.mini-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini-count {
  color: var(--hb-muted);
  font-size: var(--hb-fs-xs);
}

.sub-pane {
  border: 1px solid var(--hb-border);
  border-radius: var(--hb-r-md);
  overflow: auto;
  max-height: 42%;
}

.clickable {
  cursor: pointer;
}

.strong {
  font-weight: var(--hb-fw-medium);
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 10px 0 2px;
}
</style>
