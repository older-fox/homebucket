<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import ContributionList from '../components/ContributionList.vue';
import FieldSourceTable from '../components/FieldSourceTable.vue';
import Pager from '../components/Pager.vue';
import { errorMessage, useApi } from '../composables/useApi';
import type { AdminContribution, AdminItem, AdminItemDetail, InstanceRow, ItemPatchBody } from '../composables/useApi';
import { loadToken, session } from '../composables/useAdminToken';

type Tab = 'items' | 'instances';

const api = useApi();

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

async function searchItems(): Promise<void> {
  // 令牌在 localStorage：绝不在 SSR 期请求管理接口
  if (import.meta.server) return;
  if (!loadToken()) return;
  itemsLoading.value = true;
  error.value = '';
  try {
    const data = await api.admin.items(keyword.value.trim(), itemsPage.value, pageSize);
    items.value = data.items;
    itemsTotal.value = data.total;
  } catch (caught) {
    items.value = [];
    itemsTotal.value = 0;
    error.value = errorMessage(caught);
  } finally {
    itemsLoading.value = false;
  }
}

async function selectItem(id: number, options: { keepNotice?: boolean } = {}): Promise<void> {
  error.value = '';
  // 写操作成功后都要重新拉一次详情（服务端回的是合并后的结果），
  // 但那条「已写入人工纠错」的提示不该被这次刷新顺手清掉 —— 见 keepNotice。
  if (!options.keepNotice) notice.value = '';
  busy.value = `load-${id}`;
  try {
    const detail = await api.admin.item(id);
    selected.value = detail;
    fillForm(detail);
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    busy.value = '';
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
    notice.value = `已写入人工纠错（生效字段：${result.applied.join('、') || '无'}）`;
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
    notice.value = '已按现有流水重放该条目';
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
    error.value = '要合并的条目 ID 必须是正整数';
    return;
  }
  busy.value = 'merge';
  error.value = '';
  try {
    const result = await api.admin.merge(selected.value.id, sourceId);
    notice.value = `已把 #${sourceId} 并入 #${selected.value.id}，旧条码 ${result.source.barcode ?? '（无）'} 会继续跳到本条`;
    await selectItem(selected.value.id, { keepNotice: true });
    await searchItems();
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    busy.value = '';
  }
}

async function toggleContribution(entry: AdminContribution): Promise<void> {
  busy.value = `contribution-${entry.id}`;
  error.value = '';
  try {
    const result = await api.admin.blockContribution(
      entry.id,
      !entry.blocked,
      entry.blocked ? undefined : '人工判定为错误上报',
    );
    notice.value = `${entry.blocked ? '已恢复' : '已屏蔽'}上报 #${entry.id}（物品 #${result.item.id}）`;
    await selectItem(entry.itemId, { keepNotice: true });
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    busy.value = '';
  }
}

async function recomputeAll(): Promise<void> {
  busy.value = 'recompute-all';
  error.value = '';
  try {
    const result = await api.admin.recomputeAll();
    notice.value = `已重放 ${result.items} 个条目`;
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
const instanceReason = ref('人工封禁');
const instancesLoading = ref(false);

async function loadInstances(): Promise<void> {
  if (import.meta.server) return;
  if (!loadToken()) return;
  instancesLoading.value = true;
  error.value = '';
  try {
    const data = await api.admin.instances(instancesPage.value, pageSize);
    instances.value = data.instances;
    instancesTotal.value = data.total;
  } catch (caught) {
    instances.value = [];
    error.value = errorMessage(caught);
  } finally {
    instancesLoading.value = false;
  }
}

async function toggleInstance(row: InstanceRow): Promise<void> {
  busy.value = `instance-${row.id}`;
  error.value = '';
  try {
    const result = await api.admin.blockInstance(row.id, !row.blocked, row.blocked ? undefined : instanceReason.value);
    notice.value = `${row.blocked ? '已解封' : '已封禁'}实例「${row.name}」，连带重放 ${result.recomputedItems} 个条目`;
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

onMounted(async () => {
  loadToken();
  if (session.token) await searchItems();
});

// 同上：在顶栏补了令牌之后直接把条目列表拉出来
watch(
  () => session.token,
  (token) => {
    if (token && items.value.length === 0 && !itemsLoading.value) void searchItems();
  },
);

useHead({ title: '纠错台' });

const card = 'rounded-[10px] border border-slate-200 bg-white p-[18px] shadow-sm dark:border-slate-800 dark:bg-slate-900';
const input =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-brand-700/40';
const textarea = `${input} min-h-[76px] resize-y font-mono`;
const label = 'block text-[12.5px] text-slate-500 dark:text-slate-400';
const primaryButton =
  'inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50';
const subtleButton =
  'inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3.5 py-2 font-medium text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700';
const tinyButton = 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
const tinySubtle = 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700';
const tinyDanger = 'bg-red-600 text-white hover:bg-red-700';
const ghostButton =
  'inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[12.5px] font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800';
const chip = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
const chipWarn = 'border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
const chipDanger = 'border-red-500/30 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300';
const chipOk = 'border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
const warnNotice = 'rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2.5 text-[13.5px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
const errorNotice = 'mt-2.5 rounded-lg border border-red-500/30 bg-red-50 px-3 py-2.5 text-[13.5px] text-red-700 dark:bg-red-500/10 dark:text-red-300';
const okNotice = 'mt-2.5 rounded-lg border border-emerald-500/30 bg-emerald-50 px-3 py-2.5 text-[13.5px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
const tableWrap = 'w-full max-w-full overflow-x-auto rounded-[10px] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';
const tableHead = 'whitespace-nowrap bg-slate-100 px-3 py-2 text-left text-[13.5px] font-semibold text-slate-600 dark:bg-slate-800/70 dark:text-slate-300';
const tableCell = 'border-b border-slate-200 px-3 py-2 align-top text-[13.5px] dark:border-slate-800';
</script>

<template>
  <div class="flex flex-wrap items-center gap-3" data-testid="page-head">
    <h1 class="m-0 text-2xl font-bold">纠错台</h1>
    <button
      :class="ghostButton"
      data-testid="recompute-all"
      type="button"
      :disabled="busy === 'recompute-all'"
      @click="recomputeAll"
    >
      {{ busy === 'recompute-all' ? '重放中…' : '全库重放' }}
    </button>
  </div>
  <p class="m-0 mb-4 text-[13.5px] text-slate-500 dark:text-slate-400">
    公共资料出问题时在这里修：改字段（可选锁定，锁上后自动上报不再改写它）、屏蔽错误上报、合并重复条目、封禁刷数据的实例。
    每次改完都会立刻按剩余流水重算，所以"隐藏一条脏数据"不需要手工回滚别的字段。
  </p>

  <p v-if="!session.token" :class="warnNotice" data-testid="notice">
    需要管理令牌：点右上角「管理令牌」填入服务端的 <code class="font-mono">COLLECTOR_ADMIN_TOKEN</code>。
  </p>

  <template v-else>
    <div class="mb-4 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
      <button
        data-testid="tabs-items"
        class="-mb-px cursor-pointer border-none border-b-2 bg-transparent px-3.5 py-2 text-[15px]"
        :class="tab === 'items' ? 'border-brand-600 font-semibold text-brand-700 dark:text-brand-100' : 'border-transparent text-slate-600 dark:text-slate-300'"
        type="button"
        @click="openItems"
      >
        物品
      </button>
      <button
        data-testid="tabs-instances"
        class="-mb-px cursor-pointer border-none border-b-2 bg-transparent px-3.5 py-2 text-[15px]"
        :class="tab === 'instances' ? 'border-brand-600 font-semibold text-brand-700 dark:text-brand-100' : 'border-transparent text-slate-600 dark:text-slate-300'"
        type="button"
        @click="openInstances"
      >
        实例
      </button>
    </div>

    <p v-if="error" :class="errorNotice" data-testid="notice">{{ error }}</p>
    <p v-if="notice" :class="okNotice" data-testid="notice">{{ notice }}</p>

    <template v-if="tab === 'items'">
      <form class="mt-3.5 flex gap-2.5" @submit.prevent="applyItemFilters">
        <input
          v-model="keyword"
          :class="[input, 'min-w-0 flex-1']"
          data-testid="admin-search"
          type="search"
          placeholder="按条码 / 名称 / 型号 / 厂商 / 分类筛选"
        />
        <button :class="primaryButton" data-testid="admin-search-submit" type="submit" :disabled="itemsLoading">
          筛选
        </button>
      </form>

      <div :class="[tableWrap, 'mt-3.5']">
        <table class="w-full border-collapse text-[13.5px]">
          <thead>
            <tr>
              <th :class="[tableHead, 'text-right']">ID</th>
              <th :class="tableHead">条码</th>
              <th :class="tableHead">名称</th>
              <th :class="tableHead">厂商 / 型号</th>
              <th :class="[tableHead, 'text-right']">上报</th>
              <th :class="tableHead">状态</th>
              <th :class="tableHead" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in items" :key="row.id">
              <td :class="[tableCell, 'text-right font-mono tabular-nums']">{{ row.id }}</td>
              <td :class="[tableCell, 'font-mono text-xs']">{{ row.barcode ?? '—' }}</td>
              <td :class="tableCell">{{ row.name || '（无名称）' }}</td>
              <td :class="[tableCell, 'text-xs']">{{ [row.manufacturer, row.model].filter(Boolean).join(' / ') || '—' }}</td>
              <td :class="[tableCell, 'text-right tabular-nums']">{{ row.contributionCount }}</td>
              <td :class="tableCell">
                <span v-if="row.mergedIntoId" :class="[chip, chipWarn]">已并入 #{{ row.mergedIntoId }}</span>
                <span v-for="field in row.lockedFields" :key="field" :class="chip">锁定 {{ field }}</span>
                <span v-if="!row.mergedIntoId && row.lockedFields.length === 0" class="text-xs text-slate-500 dark:text-slate-400">
                  正常
                </span>
              </td>
              <td :class="tableCell">
                <button
                  :class="[tinyButton, tinySubtle]"
                  data-testid="admin-open"
                  type="button"
                  :disabled="busy === `load-${row.id}`"
                  @click="selectItem(row.id)"
                >
                  {{ busy === `load-${row.id}` ? '载入中…' : '打开' }}
                </button>
              </td>
            </tr>
            <tr v-if="items.length === 0">
              <td :class="[tableCell, 'text-center text-slate-500 dark:text-slate-400']" colspan="7">没有条目</td>
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
        <div :class="[card, 'mt-4']" data-testid="card">
          <div class="flex flex-wrap items-center gap-2.5">
            <h2 class="m-0 text-base font-semibold">#{{ selected.id }} {{ selected.name || '（无名称）' }}</h2>
            <span v-if="selected.barcode" :class="[chip, 'font-mono']">{{ selected.barcode }}</span>
            <span v-if="selected.mergedIntoId" :class="[chip, chipWarn]">已并入 #{{ selected.mergedIntoId }}</span>
            <span class="flex-1" />
            <button
              :class="ghostButton"
              data-testid="admin-recompute"
              type="button"
              :disabled="busy === 'recompute'"
              @click="recomputeCurrent"
            >
              重放这个条目
            </button>
          </div>
          <p class="my-3 text-[13px] text-slate-500 dark:text-slate-400">
            身份键 <code class="font-mono">{{ selected.identityKey }}</code> · {{ selected.contributionCount }} 次上报 ·
            {{ selected.instanceCount }} 个实例
          </p>
          <FieldSourceTable :fields="selected.fields" />
        </div>

        <div :class="[card, 'mt-4']" data-testid="card">
          <h2 class="mt-0 mb-3 text-base font-semibold">人工改字段</h2>
          <p class="mt-[-6px] mb-3 text-[13px] text-slate-500 dark:text-slate-400">
            留空的字段＝不动它；勾「清空」＝把该字段置空（会自动删掉它的写入时间，之后自动上报可以重新填上）。
            图片一行一个 URL，扩展属性一行一条 <code class="font-mono">键=值</code>。
          </p>
          <div class="grid gap-3 sm:grid-cols-2">
            <label v-for="field in SCALAR_FIELDS" :key="field" class="block">
              <span :class="label">
                {{ field }}
                <span v-if="selected.lockedFields.includes(field)" class="text-xs text-amber-600 dark:text-amber-400">
                  （当前锁定）
                </span>
              </span>
              <input v-model="form[field]" :class="input" data-testid="admin-field-input" :placeholder="selected[field] ?? '（空）'" />
              <span class="text-xs text-slate-500 dark:text-slate-400">
                <input v-model="form.clearFields" type="checkbox" :value="field" /> 清空
              </span>
            </label>
          </div>
          <div class="mt-2.5 grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span :class="label">imageUrls（每行一个）</span>
              <textarea v-model="form.imageUrls" :class="textarea" />
            </label>
            <label class="block">
              <span :class="label">attributes（每行 键=值）</span>
              <textarea v-model="form.attributes" :class="textarea" />
            </label>
          </div>

          <h3 class="mt-4 mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">锁定字段（锁上后自动上报不再改写）</h3>
          <div class="flex flex-wrap gap-1.5">
            <label v-for="field in [...SCALAR_FIELDS, 'imageUrls', 'attributes']" :key="field" :class="chip">
              <input v-model="form.lockedFields" data-testid="admin-field-lock" type="checkbox" :value="field" />
              {{ field }}
            </label>
          </div>

          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span :class="label">备注（写进这条人工纠错的流水里）</span>
              <input v-model="form.note" :class="input" data-testid="admin-note" placeholder="例如：包装上写的是这个型号" />
            </label>
            <label class="block">
              <span :class="label">合并：把这个 ID 的条目并进当前条目</span>
              <input
                v-model="form.mergeSourceId"
                :class="[input, 'font-mono']"
                data-testid="admin-merge-source"
                inputmode="numeric"
                placeholder="被并掉的条目 ID"
              />
            </label>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-2.5">
            <button
              :class="primaryButton"
              data-testid="admin-save"
              type="button"
              :disabled="busy === 'save'"
              @click="saveItem"
            >
              {{ busy === 'save' ? '保存中…' : '保存为人工纠错' }}
            </button>
            <button
              :class="subtleButton"
              data-testid="admin-merge"
              type="button"
              :disabled="busy === 'merge'"
              @click="mergeIntoCurrent"
            >
              {{ busy === 'merge' ? '合并中…' : '执行合并' }}
            </button>
          </div>
        </div>

        <div :class="[card, 'mt-4']" data-testid="card">
          <h2 class="mt-0 mb-3 text-base font-semibold">这个条目的上报流水（{{ selected.contributions.length }}）</h2>
          <ContributionList
            :contributions="selected.contributions"
            admin
            :busy-id="Number(busy.replace('contribution-', '')) || null"
            @toggle-block="toggleContribution"
          />
        </div>
      </template>
    </template>

    <template v-else>
      <div :class="[card, 'mt-3.5']" data-testid="card">
        <label class="block max-w-[420px]">
          <span :class="label">封禁理由（会显示在上报审计里）</span>
          <input v-model="instanceReason" :class="input" data-testid="instances-reason" />
        </label>
        <p class="mt-2 mb-0 text-[13px] text-slate-500 dark:text-slate-400">
          封禁一个实例＝它历史上报全部不参与合并（立刻重放受影响条目），且它之后的上报一律 403。
        </p>
      </div>

      <div :class="[tableWrap, 'mt-3.5']">
        <table class="w-full border-collapse text-[13.5px]">
          <thead>
            <tr>
              <th :class="[tableHead, 'text-right']">ID</th>
              <th :class="tableHead">实例</th>
              <th :class="tableHead">密钥前缀</th>
              <th :class="tableHead">平台 / 版本</th>
              <th :class="[tableHead, 'text-right']">上报</th>
              <th :class="tableHead">最后出现</th>
              <th :class="tableHead">状态</th>
              <th :class="tableHead" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in instances" :key="row.id">
              <td :class="[tableCell, 'text-right font-mono tabular-nums']">{{ row.id }}</td>
              <td :class="tableCell">{{ row.name }}</td>
              <td :class="[tableCell, 'font-mono text-xs']">{{ row.keyPrefix }}…</td>
              <td :class="[tableCell, 'text-xs']">{{ [row.platform, row.version].filter(Boolean).join(' / ') || '—' }}</td>
              <td :class="[tableCell, 'text-right tabular-nums']">{{ row.contributionCount }}</td>
              <td :class="[tableCell, 'whitespace-nowrap font-mono text-xs']">
                {{ row.lastSeenAt ? row.lastSeenAt.replace('T', ' ').slice(0, 16) : '—' }}
              </td>
              <td :class="tableCell">
                <span v-if="row.blocked" :class="[chip, chipDanger]">已封禁</span>
                <span v-else :class="[chip, chipOk]">正常</span>
                <span v-if="row.blockedReason" class="text-xs text-slate-500 dark:text-slate-400">{{ row.blockedReason }}</span>
              </td>
              <td :class="tableCell">
                <button
                  :class="[tinyButton, row.blocked ? tinySubtle : tinyDanger]"
                  :data-testid="row.blocked ? 'instances-unblock' : 'instances-block'"
                  type="button"
                  :disabled="busy === `instance-${row.id}`"
                  @click="toggleInstance(row)"
                >
                  {{ row.blocked ? '解封' : '封禁' }}
                </button>
              </td>
            </tr>
            <tr v-if="instances.length === 0">
              <td :class="[tableCell, 'text-center text-slate-500 dark:text-slate-400']" colspan="8">还没有实例注册</td>
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
  </template>
</template>
