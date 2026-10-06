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
      <ListSkeleton v-if="pending" :rows="5" />

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
          <ul v-if="mobile" class="hb-list">
            <li v-for="child in children" :key="child.id" class="hb-list-row hb-tap" @click="openChild(child.id)">
              <span class="hb-icon-tile small"><UIcon name="i-lucide-folder" /></span>
              <span class="hb-list-main">
                <span class="hb-list-title">{{ child.name }}</span>
                <span class="hb-list-sub">
                  {{ t('location.itemCount', { count: child.itemCount }) }}
                  <template v-if="child.childCount"> · {{ t('location.childCount', { count: child.childCount }) }}</template>
                </span>
              </span>
              <UIcon name="i-lucide-chevron-right" class="hb-list-chev" />
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
          <ul v-else-if="mobile" class="hb-list">
            <li v-for="item in pagedItems" :key="item.id" class="hb-list-row top" @click="navigateTo(`/items/${item.id}`)">
              <span class="hb-icon-tile small"><UIcon name="i-lucide-package" /></span>
              <span class="hb-list-main">
                <span class="hb-list-title">{{ item.name }}</span>
                <span class="hb-list-sub">
                  {{ item.location?.name || t('item.noLocation') }}
                  <template v-if="item.model"> · {{ item.model }}</template>
                </span>
                <span class="hb-list-meta">
                  <span class="hb-chip tiny hb-num">×{{ item.quantity }}</span>
                  <span v-if="item.unitCount" class="hb-chip tiny hb-num">{{ item.unitCount }} SN</span>
                </span>
              </span>
              <span class="hb-list-side hb-num">{{ money(item.price * item.quantity) }}</span>
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
            <ListPager v-model:page="itemPage" :total="data.items.length" :page-size="pageSize" />
          </div>
        </section>

        <!-- 序列号 -->
        <section v-if="data.itemUnits.length">
          <h3 class="hb-section-title">
            <UIcon name="i-lucide-barcode" />
            {{ t('location.unitsHere') }}
            <span class="hb-muted hb-num">{{ data.itemUnits.length }}</span>
          </h3>

          <ul v-if="mobile" class="hb-list">
            <li v-for="unit in pagedUnits" :key="unit.id" class="hb-list-row" @click="navigateTo(`/items/${unit.itemId}`)">
              <span class="hb-list-main">
                <span class="hb-list-title hb-mono">{{ unit.sn || '—' }}</span>
                <span class="hb-list-sub">{{ unit.itemName }} · {{ unit.locationName || t('item.noLocation') }}</span>
              </span>
              <UIcon name="i-lucide-chevron-right" class="hb-list-chev" />
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
            <ListPager v-model:page="unitPage" :total="data.itemUnits.length" :page-size="pageSize" />
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

const { loadContents, isContentsPending } = useLocations();

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

/** 有缓存先用缓存渲染（返回上一页立即出内容），再后台刷新 */
async function load(force = false) {
  const cached = data.value?.location.id === props.id ? data.value : null;
  if (!cached) pending.value = true;

  try {
    const result = await loadContents(props.id, force);
    if (result) data.value = result as Contents;
    if (!cached) {
      itemPage.value = 1;
      unitPage.value = 1;
    }
  } finally {
    pending.value = false;
  }
}

/** 移动端：子位置要么继续钻取（本页复用），要么交给页面决定 */
function openChild(id: number) {
  emit('select', id);
}

watch(
  () => props.id,
  () => void load(),
);
onMounted(() => void load());

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

/* 移动端列表用全局 .hb-list / .hb-list-row / .hb-tag（见 assets/css/main.css） */

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

/* 高度随内容撑开，交给 .detail-body 滚动；
   百分比 max-height 会以父级 section 的自身内容高为基准，把列表压成一条 */
.sub-pane {
  border: 1px solid var(--hb-border);
  border-radius: var(--hb-r-md);
  overflow: auto;
}

.clickable {
  cursor: pointer;
}

.strong {
  font-weight: var(--hb-fw-medium);
}

/* 小屏（≤420px）：头部操作换行、行内信息纵向排开 */
@media (max-width: 420px) {
  .detail-head {
    flex-wrap: wrap;
  }

  .head-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .hb-list-row {
    padding: 12px;
    gap: 10px;
  }
}
</style>
