<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import ContributionList from '../components/ContributionList.vue';
import FieldSourceTable from '../components/FieldSourceTable.vue';
import Pager from '../components/Pager.vue';
import { errorMessage, useApi } from '../composables/useApi';
import type { AdminContribution, AdminItem, AdminItemDetail, InstanceRow, ItemPatchBody } from '../composables/useApi';
import { useAuthGate } from '../composables/useAuthGate';
import { useConfirm } from '../composables/useConfirm';
import { tableCell, tableHead, tableScroll, tableWrap } from '~/utils/ui';

type Tab = 'items' | 'instances';

/** 需要登录：守卫是全局中间件 `login-gate`，未登录会被送到 /login?redirect=/admin。 */
// 登录守卫由全局中间件 `login-gate` 负责（见 nuxt.config 的 app.middleware），
// 这里不再逐页挂 —— 逐页挂漏一个就是静默对外开放。

const api = useApi();
const { t } = useI18n();
const confirm = useConfirm();

/** 未确认登录前不渲染页面内容（见 useAuthGate 的说明）。 */
const { ready, checking } = useAuthGate();

const tab = ref<Tab>('items');
const error = ref('');
const notice = ref('');

/* ---------- 物品 ---------- */
const keyword = ref('');
const items = ref<AdminItem[]>([]);
const itemsTotal = ref(0);
const itemsPage = ref(1);
const pageSize = 20;
const itemsLoading = ref(false);
const selected = ref<AdminItemDetail | null>(null);
const busy = ref('');

const SCALAR_FIELDS = ['name', 'description', 'model', 'manufacturer', 'category', 'baseUnit'] as const;

const form = reactive({
  name: '',
  description: '',
  model: '',
  manufacturer: '',
  category: '',
  baseUnit: '',
  imageUrls: '',
  attributes: '',
  clearFields: [] as string[],
  lockedFields: [] as string[],
  note: '',
  mergeSourceId: '',
});

function fillForm(item: AdminItemDetail): void {
  form.name = item.name ?? '';
  form.description = item.description ?? '';
  form.model = item.model ?? '';
  form.manufacturer = item.manufacturer ?? '';
  form.category = item.category ?? '';
  form.baseUnit = item.baseUnit ?? '';
  form.imageUrls = item.imageUrls.join('\n');
  form.attributes = Object.entries(item.attributes)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  form.clearFields = [];
  form.lockedFields = [...item.lockedFields];
  form.note = '';
  form.mergeSourceId = '';
}

let searchSeq = 0;
let detailSeq = 0;

async function searchItems(): Promise<void> {
  // 会话在 httpOnly cookie 里：绝不在 SSR 期请求管理接口（401 由 useApi 统一送回登录页）
  if (import.meta.server) return;
  // 单调序号：慢的旧请求回来时不能覆盖新请求的结果（否则搜索词与列表对不上）。
  const seq = ++searchSeq;
  itemsLoading.value = true;
  error.value = '';
  try {
    const data = await api.admin.items(keyword.value.trim(), itemsPage.value, pageSize);
    if (seq !== searchSeq) return;
    items.value = data.items;
    itemsTotal.value = data.total;
  } catch (caught) {
    if (seq !== searchSeq) return;
    items.value = [];
    itemsTotal.value = 0;
    error.value = errorMessage(caught);
  } finally {
    if (seq === searchSeq) itemsLoading.value = false;
  }
}

async function selectItem(id: number, options: { keepNotice?: boolean } = {}): Promise<void> {
  error.value = '';
  // 写操作成功后都要重新拉一次详情（服务端回的是合并后的结果），
  // 但那条「已写入人工纠错」的提示不该被这次刷新顺手清掉 —— 见 keepNotice。
  if (!options.keepNotice) notice.value = '';
  // 单调序号：慢的旧详情回来时不能覆盖新详情（否则抽屉里会显示 A 的数据却标着 B）。
  const seq = ++detailSeq;
  busy.value = `load-${id}`;
  try {
    const detail = await api.admin.item(id);
    if (seq !== detailSeq) return;
    selected.value = detail;
    fillForm(detail);
  } catch (caught) {
    if (seq !== detailSeq) return;
    error.value = errorMessage(caught);
  } finally {
    if (seq === detailSeq) busy.value = '';
  }
}

function parseAttributes(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    result[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return result;
}

async function saveItem(): Promise<void> {
  if (!selected.value) return;
  error.value = '';
  notice.value = '';
  busy.value = 'save';
  try {
    const body: ItemPatchBody = { lockedFields: form.lockedFields };
    for (const field of SCALAR_FIELDS) {
      const value = form[field].trim();
      if (value) body[field] = value;
    }
    const urls = form.imageUrls
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (urls.length > 0) body.imageUrls = urls;
    const attributes = parseAttributes(form.attributes);
    if (Object.keys(attributes).length > 0) body.attributes = attributes;
    if (form.clearFields.length > 0) body.clearFields = form.clearFields;
    if (form.note.trim()) body.note = form.note.trim();

    const result = await api.admin.patchItem(selected.value.id, body);
    notice.value = t('admin.detail.applied', { fields: result.applied.join(t('item.field.sep')) || t('admin.detail.appliedNone') });
    await selectItem(selected.value.id, { keepNotice: true });
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    busy.value = '';
  }
}

async function recomputeCurrent(): Promise<void> {
  if (!selected.value) return;
  busy.value = 'recompute';
  error.value = '';
  try {
    await api.admin.recomputeItem(selected.value.id);
    notice.value = t('admin.detail.recomputed');
    await selectItem(selected.value.id, { keepNotice: true });
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    busy.value = '';
  }
}

async function mergeIntoCurrent(): Promise<void> {
  if (!selected.value) return;
  const sourceId = Number(form.mergeSourceId);
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    error.value = t('admin.detail.mergeNeedsPositiveId');
    return;
  }
  if (
    !(await confirm({
      title: t('confirm.title'),
      message: t('admin.confirm.merge', { sourceId, targetId: selected.value.id }),
      tone: 'error',
    }))
  ) {
    return;
  }
  busy.value = 'merge';
  error.value = '';
  try {
    const result = await api.admin.merge(selected.value.id, sourceId);
    notice.value = t('admin.detail.merged', {
      sourceId,
      targetId: selected.value.id,
      barcode: result.source.barcode ?? t('admin.detail.noBarcode'),
    });
    await selectItem(selected.value.id, { keepNotice: true });
    await searchItems();
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    busy.value = '';
  }
}

async function toggleContribution(entry: AdminContribution): Promise<void> {
  if (!entry.blocked) {
    if (
      !(await confirm({
        title: t('confirm.title'),
        message: t('admin.confirm.blockContribution', { id: entry.id }),
        tone: 'error',
      }))
    ) {
      return;
    }
  }
  busy.value = `contribution-${entry.id}`;
  error.value = '';
  try {
    const result = await api.admin.blockContribution(
      entry.id,
      !entry.blocked,
      entry.blocked ? undefined : t('errors.blockedReason'),
    );
    notice.value = t('admin.detail.toggleNotice', {
      action: entry.blocked ? t('audit.restored') : t('audit.blocked'),
      id: entry.id,
      itemId: result.item.id,
    });
    await selectItem(entry.itemId, { keepNotice: true });
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    busy.value = '';
  }
}

async function recomputeAll(): Promise<void> {
  if (
    !(await confirm({
      title: t('confirm.title'),
      message: t('admin.confirm.recomputeAll'),
      tone: 'primary',
    }))
  ) {
    return;
  }
  busy.value = 'recompute-all';
  error.value = '';
  try {
    const result = await api.admin.recomputeAll();
    notice.value = t('admin.recomputedAll', { count: result.items });
    if (selected.value) await selectItem(selected.value.id, { keepNotice: true });
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    busy.value = '';
  }
}

function applyItemFilters(): void {
  itemsPage.value = 1;
  void searchItems();
}

/* ---------- 实例 ---------- */
const instances = ref<InstanceRow[]>([]);
const instancesTotal = ref(0);
const instancesPage = ref(1);
const instanceReason = ref('');
const instancesLoading = ref(false);

let instancesSeq = 0;

async function loadInstances(): Promise<void> {
  if (import.meta.server) return;
  // 单调序号：慢的旧请求回来时不能覆盖新请求的结果。
  const seq = ++instancesSeq;
  instancesLoading.value = true;
  error.value = '';
  try {
    const data = await api.admin.instances(instancesPage.value, pageSize);
    if (seq !== instancesSeq) return;
    instances.value = data.instances;
    instancesTotal.value = data.total;
  } catch (caught) {
    if (seq !== instancesSeq) return;
    instances.value = [];
    error.value = errorMessage(caught);
  } finally {
    if (seq === instancesSeq) instancesLoading.value = false;
  }
}

async function toggleInstance(row: InstanceRow): Promise<void> {
  if (!row.blocked) {
    if (
      !(await confirm({
        title: t('confirm.title'),
        message: t('admin.confirm.blockInstance', { name: row.name }),
        tone: 'error',
      }))
    ) {
      return;
    }
  }
  busy.value = `instance-${row.id}`;
  error.value = '';
  try {
    const reason = instanceReason.value || t('admin.instances.reasonDefault');
    const result = await api.admin.blockInstance(row.id, !row.blocked, row.blocked ? undefined : reason);
    notice.value = t('admin.instances.toggleNotice', {
      action: row.blocked ? t('admin.instances.unblocked') : t('admin.instances.blocked'),
      name: row.name,
      count: result.recomputedItems,
    });
    await loadInstances();
    if (selected.value) await selectItem(selected.value.id, { keepNotice: true });
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    busy.value = '';
  }
}

function openInstances(): void {
  tab.value = 'instances';
  void loadInstances();
}

function openItems(): void {
  tab.value = 'items';
}

/**
 * 会话确认后才拉列表。
 *
 * 必须 watch `ready`，不能写成 `onMounted(() => { if (adminSession.user) … })`：
 * `useAuthGate()` 要等 `/api/admin/session` 返回才知道登录状态，两个 `onMounted`
 * 的先后顺序不确定；页面的先跑就会拿到 null 的 `adminSession.user`，列表永远不加载
 * （表现为页面空白）。`ready` 是 gate 给的"已确认登录"信号。
 * 请求中途若会话失效（401），useApi 会把人送回 /login?redirect=…
 */
watch(ready, async (ok) => {
  if (ok) await searchItems();
});

/** 封禁理由默认值来自 i18n，所以输入框初值在 setup 里补一次（不能写死在 reactive 里）。 */
instanceReason.value = t('admin.instances.reasonDefault');

useHead({ title: computed(() => t('admin.title')) });

/**
 * 字段名的「最小 label span」：验收脚本按 `label span:has-text(/^name/)` 定位，
 * 所以标量字段行保留原生 `<label><span>` 结构，不换成 UFormField。
 */
const fieldLabel = 'mb-1.5 block text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400';
/** tab 条：只留底部 1px 指示线，靠文字与线的颜色区分选中，不用整块背景（规范 §6.6 的同一条思路） */
const tabButton = '-mb-px rounded-none border-b-2 bg-transparent px-4 py-2.5 text-sm hover:bg-transparent';
const tabActive = 'border-blue-600 font-semibold text-blue-700 dark:border-blue-400 dark:text-blue-300';
const tabIdle = 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white';
</script>

<template>
  <!--
    未确认登录前只渲染过场（见 `useAuthGate`）。受保护内容整块包在 v-if 里，
    未登录的人一帧都看不到 —— 这正是"不进入首页"的要求。
  -->
  <div v-if="checking" class="flex flex-col items-center gap-3 py-20 text-center" data-testid="auth-checking">
    <AppIcon name="lock" class="h-6 w-6 animate-pulse text-gray-400 dark:text-gray-500" />
    <p class="m-0 text-sm text-gray-500 dark:text-gray-400">{{ t('auth.checking') }}</p>
  </div>
  <div v-else>
  <div data-testid="page-head" class="flex flex-wrap items-center gap-3">
    <h1 class="m-0 text-2xl font-semibold tracking-tight">{{ t('admin.title') }}</h1>
    <UButton
      variant="outline"
      color="neutral"
      size="lg"
      data-testid="recompute-all"
      :loading="busy === 'recompute-all'"
      @click="recomputeAll"
    >
      <AppIcon name="refresh" class="h-4 w-4" />
      {{ busy === 'recompute-all' ? t('admin.recomputeAllBusy') : t('admin.recomputeAll') }}
    </UButton>
  </div>
  <p class="mt-2 mb-6 max-w-3xl text-sm leading-6 whitespace-pre-line text-gray-500 dark:text-gray-400">
    {{ t('admin.intro') }}
  </p>

  <div class="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-800">
    <UButton
      variant="ghost"
      color="neutral"
      data-testid="tabs-items"
      :class="[tabButton, tab === 'items' ? tabActive : tabIdle]"
      @click="openItems"
    >
      {{ t('admin.tabs.items') }}
    </UButton>
    <UButton
      variant="ghost"
      color="neutral"
      data-testid="tabs-instances"
      :class="[tabButton, tab === 'instances' ? tabActive : tabIdle]"
      @click="openInstances"
    >
      {{ t('admin.tabs.instances') }}
    </UButton>
  </div>

  <AppNotice v-if="error" tone="error" class="mt-4" data-testid="notice">{{ error }}</AppNotice>
  <AppNotice v-if="notice" tone="success" class="mt-4" data-testid="notice">{{ notice }}</AppNotice>

  <template v-if="tab === 'items'">
    <form class="mt-5 flex gap-2.5" @submit.prevent="applyItemFilters">
      <UInput
        v-model="keyword"
        size="lg"
        class="min-w-0 flex-1"
        data-testid="admin-search"
        type="search"
        :aria-label="t('common.ariaSearchInput')"
        :placeholder="t('admin.searchPlaceholder')"
      />
      <UButton type="submit" color="primary" size="lg" :loading="itemsLoading" data-testid="admin-search-submit">
        {{ t('common.filter') }}
      </UButton>
    </form>

    <div :class="[tableWrap, tableScroll, 'mt-4']">
      <table class="w-full border-collapse">
        <thead>
          <tr>
            <th :class="[tableHead, 'text-right']">{{ t('admin.table.id') }}</th>
            <th :class="tableHead">{{ t('admin.table.barcode') }}</th>
            <th :class="tableHead">{{ t('admin.table.name') }}</th>
            <th :class="tableHead">{{ t('admin.table.manufacturerModel') }}</th>
            <th :class="[tableHead, 'text-right']">{{ t('admin.table.contributions') }}</th>
            <th :class="tableHead">{{ t('common.status') }}</th>
            <th :class="tableHead" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in items" :key="row.id">
            <td :class="[tableCell, 'text-right font-mono tabular']">{{ row.id }}</td>
            <td :class="[tableCell, 'font-mono text-xs']">{{ row.barcode ?? t('common.empty') }}</td>
            <td :class="[tableCell, 'font-medium']">{{ row.name || t('admin.table.noName') }}</td>
            <td :class="[tableCell, 'text-xs text-gray-500 dark:text-gray-400']">
              {{ [row.manufacturer, row.model].filter(Boolean).join(t('common.pathSep')) || t('common.empty') }}
            </td>
            <td :class="[tableCell, 'tabular text-right']">{{ row.contributionCount }}</td>
            <td :class="tableCell">
              <div class="flex flex-wrap items-center gap-1.5">
                <UBadge v-if="row.mergedIntoId" color="neutral" variant="soft" size="sm">
                  {{ t('admin.table.mergedInto', { id: row.mergedIntoId }) }}
                </UBadge>
                <UBadge v-for="field in row.lockedFields" :key="field" color="neutral" variant="soft" size="sm">
                  {{ t('admin.table.fieldLock', { field }) }}
                </UBadge>
                <span v-if="!row.mergedIntoId && row.lockedFields.length === 0" class="text-xs text-gray-500 dark:text-gray-400">
                  {{ t('admin.table.normal') }}
                </span>
              </div>
            </td>
            <td :class="tableCell">
              <!-- 「打开」在窄屏只放图标，所以 aria-label 必填（规范 §6.1） -->
              <UButton
                variant="outline"
                color="neutral"
                size="xs"
                data-testid="admin-open"
                :aria-label="t('admin.table.openAria', { id: row.id })"
                :disabled="busy === `load-${row.id}`"
                @click="selectItem(row.id)"
              >
                <AppIcon name="edit" class="h-4 w-4" />
                <span class="max-sm:hidden">{{ busy === `load-${row.id}` ? t('common.loadingShort') : t('common.open') }}</span>
              </UButton>
            </td>
          </tr>
          <tr v-if="items.length === 0">
            <td :class="[tableCell, 'text-center text-gray-500 dark:text-gray-400']" colspan="7">{{ t('admin.table.noItems') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <Pager
      :page="itemsPage"
      :page-size="pageSize"
      :total="itemsTotal"
      @update:page="
        (value) => {
          itemsPage = value;
          searchItems();
        }
      "
    />

    <template v-if="selected">
      <AppCard
        :title="`#${selected.id} ${selected.name || t('admin.table.noName')}`"
        :subtitle="t('admin.detail.identity', { key: selected.identityKey, contributions: selected.contributionCount, instances: selected.instanceCount })"
        class="mt-4"
        data-testid="card"
      >
        <template #actions>
          <UButton
            variant="outline"
            color="neutral"
            size="sm"
            data-testid="admin-recompute"
            :disabled="busy === 'recompute'"
            @click="recomputeCurrent"
          >
            <AppIcon name="refresh" class="h-4 w-4" />
            {{ t('admin.detail.recompute') }}
          </UButton>
        </template>
        <div v-if="selected.barcode || selected.mergedIntoId" class="mb-3 flex flex-wrap items-center gap-2">
          <UBadge v-if="selected.barcode" color="neutral" variant="soft" size="sm">
            <span class="font-mono">{{ selected.barcode }}</span>
          </UBadge>
          <UBadge v-if="selected.mergedIntoId" color="neutral" variant="soft" size="sm">
            {{ t('admin.table.mergedInto', { id: selected.mergedIntoId }) }}
          </UBadge>
        </div>
        <FieldSourceTable :fields="selected.fields" />
      </AppCard>

      <AppCard :title="t('admin.detail.editHeading')" class="mt-4" data-testid="card">
        <p class="mt-0 mb-4 text-sm leading-6 whitespace-pre-line text-gray-500 dark:text-gray-400">
          {{ t('admin.detail.editHint') }}
        </p>
        <div class="grid gap-4 sm:grid-cols-2">
          <!--
            字段名必须放在 <label> 内的 <span> 里，且文本以字段名开头 —— 验收脚本靠
            `label span:has-text(/^name/)` 找到 name 那一格，再把输入框填进去。
          -->
          <label v-for="field in SCALAR_FIELDS" :key="field" class="block">
            <span :class="fieldLabel">
              {{ field }}
              <span v-if="selected.lockedFields.includes(field)" class="text-gray-500 normal-case dark:text-gray-400">
                {{ t('admin.detail.currentlyLocked') }}
              </span>
            </span>
            <UInput
              v-model="form[field]"
              size="lg"
              class="w-full"
              data-testid="admin-field-input"
              :placeholder="selected[field] ?? t('admin.detail.emptyValue')"
            />
            <span class="mt-1.5 inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <input
                v-model="form.clearFields"
                type="checkbox"
                :value="field"
                class="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-gray-700 dark:bg-gray-900 dark:text-blue-400"
              />
              {{ t('admin.detail.clear') }}
            </span>
          </label>
        </div>
        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <UFormField :label="t('admin.detail.imageUrlsLabel')">
            <UTextarea
              v-model="form.imageUrls"
              class="w-full font-mono"
              :placeholder="t('admin.detail.imageUrlsPlaceholder')"
            />
          </UFormField>
          <UFormField :label="t('admin.detail.attributesLabel')">
            <UTextarea
              v-model="form.attributes"
              class="w-full font-mono"
              :placeholder="t('admin.detail.attributesPlaceholder')"
            />
          </UFormField>
        </div>

        <h3 class="mt-6 mb-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200">{{ t('admin.detail.lockHeading') }}</h3>
        <div class="flex flex-wrap gap-1.5">
          <!--
            必须是原生 <input type="checkbox"> 带 :value="field"：验收脚本按
            `[data-testid=admin-field-lock][value=name]` 选中并 .check()，换成按钮就点不动。
          -->
          <label
            v-for="field in [...SCALAR_FIELDS, 'imageUrls', 'attributes']"
            :key="field"
            class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            <input
              v-model="form.lockedFields"
              data-testid="admin-field-lock"
              type="checkbox"
              :value="field"
              class="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-gray-600 dark:bg-gray-900 dark:text-blue-400"
            />
            <span class="font-mono">{{ field }}</span>
          </label>
        </div>

        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <UFormField :label="t('admin.detail.noteLabel')">
            <UInput
              v-model="form.note"
              size="lg"
              class="w-full"
              data-testid="admin-note"
              :placeholder="t('admin.detail.notePlaceholder')"
            />
          </UFormField>
          <UFormField :label="t('admin.detail.mergeLabel')">
            <UInput
              v-model="form.mergeSourceId"
              size="lg"
              class="w-full font-mono"
              data-testid="admin-merge-source"
              inputmode="numeric"
              :placeholder="t('admin.detail.mergePlaceholder')"
            />
          </UFormField>
        </div>

        <div class="mt-5 flex flex-wrap items-center gap-2.5">
          <UButton color="primary" size="lg" :loading="busy === 'save'" data-testid="admin-save" @click="saveItem">
            {{ busy === 'save' ? t('common.saving') : t('admin.detail.save') }}
          </UButton>
          <UButton
            variant="outline"
            color="neutral"
            size="lg"
            :disabled="busy === 'merge'"
            data-testid="admin-merge"
            @click="mergeIntoCurrent"
          >
            {{ busy === 'merge' ? t('common.merging') : t('admin.detail.merge') }}
          </UButton>
        </div>
      </AppCard>

      <AppCard :title="t('admin.detail.contributions', { count: selected.contributions.length })" class="mt-4" data-testid="card">
        <ContributionList
          :contributions="selected.contributions"
          admin
          :busy-id="Number(busy.replace('contribution-', '')) || null"
          @toggle-block="toggleContribution"
        />
      </AppCard>
    </template>
  </template>

  <template v-else>
    <AppCard class="mt-5" data-testid="card">
      <UFormField :label="t('admin.instances.reasonLabel')" class="max-w-[420px]">
        <UInput
          v-model="instanceReason"
          size="lg"
          class="w-full"
          data-testid="instances-reason"
          :placeholder="t('admin.instances.reasonPlaceholder')"
        />
      </UFormField>
      <p class="mt-3 mb-0 text-sm leading-6 text-gray-500 dark:text-gray-400">
        {{ t('admin.instances.hint') }}
      </p>
    </AppCard>

    <div :class="[tableWrap, tableScroll, 'mt-4']">
      <table class="w-full border-collapse">
        <thead>
          <tr>
            <th :class="[tableHead, 'text-right']">{{ t('admin.table.id') }}</th>
            <th :class="tableHead">{{ t('admin.tabs.instances') }}</th>
            <th :class="tableHead">{{ t('admin.instances.keyPrefix') }}</th>
            <th :class="tableHead">{{ t('admin.instances.platform') }}</th>
            <th :class="[tableHead, 'text-right']">{{ t('admin.table.contributions') }}</th>
            <th :class="tableHead">{{ t('admin.instances.lastSeen') }}</th>
            <th :class="tableHead">{{ t('common.status') }}</th>
            <th :class="tableHead" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in instances" :key="row.id">
            <td :class="[tableCell, 'text-right font-mono tabular']">{{ row.id }}</td>
            <td :class="[tableCell, 'font-medium']">{{ row.name }}</td>
            <td :class="[tableCell, 'font-mono text-xs']">{{ row.keyPrefix }}…</td>
            <td :class="[tableCell, 'text-xs text-gray-500 dark:text-gray-400']">
              {{ [row.platform, row.version].filter(Boolean).join(t('common.pathSep')) || t('common.empty') }}
            </td>
            <td :class="[tableCell, 'tabular text-right']">{{ row.contributionCount }}</td>
            <td :class="[tableCell, 'whitespace-nowrap font-mono text-xs text-gray-500 dark:text-gray-400']">
              {{ row.lastSeenAt ? row.lastSeenAt.replace('T', ' ').slice(0, 16) : t('common.empty') }}
            </td>
            <td :class="tableCell">
              <!-- 每行只能出现一个状态词：验收脚本断言「已封禁」/「正常」在该行各只出现一次 -->
              <div class="flex flex-wrap items-center gap-1.5">
                <UBadge :color="row.blocked ? 'neutral' : 'success'" variant="soft" size="sm">
                  {{ row.blocked ? t('admin.instances.blocked') : t('admin.instances.normal') }}
                </UBadge>
              </div>
            </td>
            <td :class="tableCell">
              <UButton
                :color="row.blocked ? 'neutral' : 'error'"
                variant="outline"
                size="xs"
                :data-testid="row.blocked ? 'instances-unblock' : 'instances-block'"
                :aria-label="t('admin.instances.toggleAria', {
                  action: row.blocked ? t('admin.instances.unblock') : t('admin.instances.block'),
                  id: row.id,
                  name: row.name,
                })"
                :disabled="busy === `instance-${row.id}`"
                @click="toggleInstance(row)"
              >
                {{ row.blocked ? t('admin.instances.unblock') : t('admin.instances.block') }}
              </UButton>
            </td>
          </tr>
          <tr v-if="instances.length === 0">
            <td :class="[tableCell, 'text-center text-gray-500 dark:text-gray-400']" colspan="8">{{ t('admin.instances.noInstances') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <Pager
      :page="instancesPage"
      :page-size="pageSize"
      :total="instancesTotal"
      @update:page="
        (value) => {
          instancesPage = value;
          loadInstances();
        }
      "
    />
  </template>
  </div>
</template>
