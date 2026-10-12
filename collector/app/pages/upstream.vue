<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Pager from '../components/Pager.vue';
import { capture, useApi } from '../composables/useApi';
import type { Loaded, SyncDetailView, SyncListView, SyncPayloadItem, SyncStatusFilter } from '../composables/useApi';
import { useAuthGate } from '../composables/useAuthGate';

const api = useApi();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();

/** 未确认登录前不渲染页面内容（见 useAuthGate 的说明）。 */
const { ready, checking } = useAuthGate();

/** 需要登录：守卫是全局中间件 `login-gate`，未登录会被送到 /login?redirect=/upstream。 */
// 登录守卫由全局中间件 `login-gate` 负责（见 nuxt.config 的 app.middleware），
// 这里不再逐页挂 —— 逐页挂漏一个就是静默对外开放。

const pageSize = 20;

/**
 * 状态筛选与分页都放在 URL 查询串里（和 /sources 一样）：SSR 与客户端读同一份状态，
 * 刷新/分享链接也还停在同一个视图上。
 */
const status = computed<SyncStatusFilter | undefined>(() => {
  const raw = String(route.query.status ?? '');
  return raw === 'pending' || raw === 'ok' || raw === 'failed' ? raw : undefined;
});
const page = computed(() => Number(route.query.page ?? 1) || 1);

/**
 * 管理接口要 httpOnly cookie：SSR 期在服务端请求只会白拿一个 401。
 * 所以服务端先渲染空态，挂载之后才真正取数 —— 与 sources.vue / audit.vue 同一条规矩。
 */
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});

const { data, pending, refresh } = await useAsyncData<Loaded<SyncListView>>(
  () => `upstream-${status.value ?? 'all'}-${page.value}`,
  () =>
    mounted.value
      ? capture(() => api.admin.sync(status.value))
      : Promise.resolve<Loaded<SyncListView>>({ data: null, error: '', status: 0 }),
  {
    watch: [status, page, mounted],
    default: (): Loaded<SyncListView> => ({ data: null, error: '', status: 0 }),
  },
);

const view = computed(() => data.value?.data ?? null);
const error = computed(() => data.value?.error ?? '');
const loading = computed(() => pending.value);

/**
 * 服务端把整份账本按状态分好的计数一起返回（counts.total/pending/ok/failed），
 * 所以筛选切换不必再发一次请求就能画出四个数字。
 */
const counts = computed(() => view.value?.counts ?? { total: 0, pending: 0, ok: 0, failed: 0 });
const configured = computed(() => view.value?.configured ?? false);
const config = computed(() => view.value?.config ?? null);

/** 分页在客户端做：服务端按状态一次返回全量账本（条目量级是"有条码的物品数"，不是流水表）。 */
const filtered = computed(() => view.value?.rows ?? []);
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize));
const total = computed(() => filtered.value.length);

// ── 手动触发一轮 ────────────────────────────────────────────────────────
const running = ref(false);
const force = ref(false);
const runMessage = ref('');
const runError = ref('');

async function runNow(): Promise<void> {
  if (running.value) return;
  running.value = true;
  runMessage.value = '';
  runError.value = '';
  const result = await capture(() => api.admin.runSync(force.value));
  running.value = false;
  if (result.error || !result.data) {
    runError.value = result.error || t('common.status');
    return;
  }
  const { scanned, sent, skipped, failed, configured: wasConfigured } = result.data;
  runMessage.value = wasConfigured
    ? t('upstream.runResult', { scanned, sent, skipped, failed })
    : t('upstream.runNotConfigured');
  await refresh();
}

// ── 置回待同步 ──────────────────────────────────────────────────────────
const notice = ref('');
const noticeError = ref('');
const busyId = ref<number | null>(null);

async function resetRow(row: { id: number; name: string | null; barcode: string | null; catalogItemId: number }): Promise<void> {
  if (busyId.value !== null) return;
  busyId.value = row.id;
  notice.value = '';
  noticeError.value = '';
  const result = await capture(() => api.admin.resetSync(row.id));
  busyId.value = null;
  if (result.error || !result.data) {
    noticeError.value = result.error || t('upstream.resetMissing');
    return;
  }
  notice.value = t('upstream.resetDone', { name: nameOf(row) });
  await refresh();
}

// ── 展示辅助 ────────────────────────────────────────────────────────────
/** 条目名可能为空（被合并或还没名称），回落到条码，再回落到 id —— 表格里不能出现空格子。 */
function nameOf(row: { name: string | null; barcode: string | null; catalogItemId: number }): string {
  return row.name || row.barcode || `#${row.catalogItemId}`;
}

/**
 * 状态码 → i18n key。
 *
 * `value[0]` 在开启了 `noUncheckedIndexedAccess` 的类型定义下是 `string | undefined`，
 * 所以先取字符再兜底成空串 —— 这里的三个分支已经保证了它有值，但不能让类型检查器猜。
 */
function statusKey(value: string): string {
  if (value !== 'pending' && value !== 'ok' && value !== 'failed') return 'upstream.statusUnknown';
  const head = value.charAt(0).toUpperCase();
  return `upstream.status${head}${value.slice(1)}`;
}

function statusTone(value: string): 'success' | 'warning' | 'error' | 'neutral' {
  if (value === 'ok') return 'success';
  if (value === 'failed') return 'error';
  if (value === 'pending') return 'warning';
  return 'neutral';
}

/**
 * 传输方式说人话。
 *
 * `file` 落的是本机目录，界面上直接把目录显出来比写「file」有用；`http` 走的是网络，
 * 把地址显出来。未知值原样显示，不假装认识它 —— 将来加了新传输方式，这里不该撒谎。
 */
function transportLabel(row: { transport: string }): string {
  if (row.transport === 'file') return t('upstream.dir');
  if (row.transport === 'http') return t('upstream.endpoint');
  if (row.transport === 'off') return t('upstream.transportOff');
  return row.transport;
}

function shortTime(value: string | null): string {
  if (!value) return t('upstream.never');
  return value.replace('T', ' ').slice(0, 16);
}

/**
 * 字段完整度：只按"上级库能对上号"的字段算 —— 条码是身份，名称是必需，其余是加分项。
 * 这不是校验，只是让管理员一眼看出哪些条目上传过去会是一堆空字段。
 */
const COMPLETENESS_FIELDS = ['name', 'manufacturer', 'model', 'category'] as const;
function missingOf(payload: SyncPayloadItem | null): string[] {
  if (!payload) return [];
  return COMPLETENESS_FIELDS.filter((field) => {
    const value = payload[field as keyof SyncPayloadItem];
    return value === null || value === undefined || value === '';
  });
}

// ── 详情（上行载荷预览）─────────────────────────────────────────────────
/**
 * 点进来想问的是"**现在**再送一次会送什么"，所以服务端是现算的（previewOf 与实际发送
 * 共用同一份构造）。列表里已经有行数据，这里只补一份载荷预览。
 */
const detailOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref('');
const detailPayload = ref<Loaded<SyncDetailView>>({
  data: null,
  error: '',
  status: 0,
});

async function openDetail(rowId: number): Promise<void> {
  detailOpen.value = true;
  detailLoading.value = true;
  detailError.value = '';
  const result = await capture(() => api.admin.syncItem(rowId));
  detailLoading.value = false;
  if (result.error || !result.data) {
    detailError.value = result.error || t('upstream.syncMissing');
    detailPayload.value = { data: null, error: result.error, status: result.status };
    return;
  }
  detailPayload.value = result;
}

function closeDetail(): void {
  detailOpen.value = false;
  detailPayload.value = { data: null, error: '', status: 0 };
}

/**
 * 抽屉里的 Esc 出口 —— 与 layout 的移动端抽屉同一条无障碍要求：
 * 浮层不给键盘出口，键盘用户会被困在里面。
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && detailOpen.value) closeDetail();
}
onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

async function goPage(value: number): Promise<void> {
  await router.push({ query: { ...route.query, page: value > 1 ? String(value) : undefined } });
}

async function setStatus(value: SyncStatusFilter | undefined): Promise<void> {
  await router.push({ query: { ...route.query, status: value, page: undefined } });
}

const rawPayload = computed(() => (detailPayload.value.data?.payload ? JSON.stringify(detailPayload.value.data.payload, null, 2) : ''));
const rawOpen = ref(false);

useHead({ title: computed(() => t('upstream.title')) });

const card = 'rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900';
const tableWrap = 'w-full max-w-full overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900';
const tableHead = 'whitespace-nowrap border-b border-gray-200 bg-gray-50 px-3 py-2.5 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-400';
const tableCell = 'border-b border-gray-200 px-3 py-2.5 align-top text-sm dark:border-gray-800';
const rowLink =
  'inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 no-underline transition-colors duration-150 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800';
const errorNotice = 'flex items-start gap-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400';
const okNotice = 'flex items-start gap-2 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400';
const emptyIcon = 'grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300';
const chip = 'inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300';
const statTile = 'rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900';
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
  <div data-testid="upstream-page">
    <div data-testid="page-head" class="flex flex-wrap items-baseline gap-3">
      <h1 class="m-0 text-2xl font-semibold tracking-tight">{{ t('upstream.title') }}</h1>
      <UBadge v-if="configured" color="success" variant="soft" size="sm">{{ t('upstream.tokenConfigured') }}</UBadge>
      <UBadge v-else color="neutral" variant="soft" size="sm">{{ t('upstream.transportOff') }}</UBadge>
    </div>
    <p class="mt-2 mb-6 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
      {{ t('upstream.intro') }}
    </p>
    <p class="mb-6 max-w-3xl text-xs leading-5 text-gray-500 dark:text-gray-400">
      {{ t('upstream.introNoBarcode') }}
    </p>

    <p v-if="error" :class="[errorNotice, 'mb-6']" data-testid="upstream-error">
      <AppIcon name="alert" class="mt-0.5 h-4 w-4 shrink-0" />
      <span>{{ error }}</span>
    </p>

    <!-- 配置块：把"为什么没自动传"直接说清楚，而不是让管理员去翻环境变量 -->
    <div v-if="view" :class="[card, 'mb-6']" data-testid="upstream-config">
      <div class="flex flex-wrap items-center gap-2">
        <AppIcon name="database" class="h-[18px] w-[18px] text-gray-400 dark:text-gray-500" />
        <h2 class="m-0 text-base font-semibold">{{ t('upstream.title') }}</h2>
        <UBadge :color="configured ? 'success' : 'neutral'" variant="soft" size="sm">
          {{ configured ? (config?.transport ?? '') : t('upstream.transportOff') }}
        </UBadge>
      </div>
      <p v-if="!configured" class="mt-2 mb-0 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400" data-testid="upstream-off">
        {{ t('upstream.transportOffHint') }}
      </p>
      <template v-else>
        <p
          v-if="config && config.intervalMinutes <= 0"
          class="mt-2 mb-0 max-w-3xl text-sm leading-6 text-amber-600 dark:text-amber-400"
          data-testid="upstream-manual"
        >
          {{ t('upstream.intervalManual') }} —— {{ t('upstream.intervalManualHint') }}
        </p>
        <p v-else class="mt-2 mb-0 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
          {{ t('upstream.intervalHint', { minutes: config?.intervalMinutes ?? 0 }) }}
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <span :class="chip">
            {{ t('upstream.endpoint') }}：
            <span class="font-mono">{{ config?.endpoint || config?.dir || t('common.empty') }}</span>
          </span>
          <span :class="chip">{{ t('upstream.batchSize', { count: config?.batchSize ?? 0 }) }}</span>
          <span :class="chip">{{ t('upstream.maxAttempts', { count: config?.maxAttempts ?? 0 }) }}</span>
          <span :class="chip">{{ config?.includePhotos ? t('upstream.includePhotos') : t('upstream.noPhotos') }}</span>
          <span :class="[chip, config?.hasToken ? '' : 'text-amber-600 dark:text-amber-400']">
            {{ config?.hasToken ? t('upstream.tokenConfigured') : t('upstream.tokenMissing') }}
          </span>
        </div>
        <p v-if="config && !config.hasToken" class="mt-2 mb-0 max-w-3xl text-xs leading-5 text-amber-600 dark:text-amber-400">
          {{ t('upstream.tokenMissingHint') }}
        </p>
      </template>
    </div>

    <!-- 计数 + 手动触发 -->
    <div class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="upstream-stats">
      <button
        v-for="item in [
          { key: undefined, label: 'countsTotal', value: counts.total },
          { key: 'pending' as const, label: 'countsPending', value: counts.pending },
          { key: 'ok' as const, label: 'countsOk', value: counts.ok },
          { key: 'failed' as const, label: 'countsFailed', value: counts.failed },
        ]"
        :key="item.label"
        type="button"
        :class="[statTile, 'text-left transition-shadow duration-200 hover:shadow-lg hover:shadow-gray-900/5', status === item.key ? 'ring-2 ring-blue-500/40' : '']"
        :data-testid="`upstream-count-${item.key ?? 'total'}`"
        :aria-pressed="status === item.key"
        @click="setStatus(item.key)"
      >
        <p class="m-0 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
          {{ t(`upstream.${item.label}`) }}
        </p>
        <p class="tabular mt-1 mb-0 text-3xl font-semibold">{{ item.value }}</p>
      </button>
    </div>

    <div :class="[card, 'mb-6 flex flex-wrap items-center gap-3']">
      <UButton
        color="primary"
        size="lg"
        :loading="running"
        :disabled="running || loading"
        data-testid="upstream-run"
        @click="runNow"
      >
        <AppIcon name="refresh" class="h-5 w-5" />
        {{ running ? t('upstream.runBusy') : t('upstream.runNow') }}
      </UButton>
      <label class="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          v-model="force"
          data-testid="upstream-force"
          type="checkbox"
          class="h-4 w-4 rounded border-gray-300 text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-gray-700 dark:bg-gray-900"
        />
        {{ t('upstream.runForce') }}
      </label>
      <span class="text-xs leading-5 text-gray-500 dark:text-gray-400">{{ t('upstream.runSkippedHint') }}</span>
    </div>

    <p v-if="runMessage" :class="[okNotice, 'mb-4']" data-testid="upstream-run-result">
      <AppIcon name="check" class="mt-0.5 h-4 w-4 shrink-0" />
      <span>{{ runMessage }}</span>
    </p>
    <p v-if="runError" :class="[errorNotice, 'mb-4']" data-testid="upstream-run-error">
      <AppIcon name="alert" class="mt-0.5 h-4 w-4 shrink-0" />
      <span>{{ runError }}</span>
    </p>
    <p v-if="notice" :class="[okNotice, 'mb-4']" data-testid="upstream-notice">
      <AppIcon name="check" class="mt-0.5 h-4 w-4 shrink-0" />
      <span>{{ notice }}</span>
    </p>
    <p v-if="noticeError" :class="[errorNotice, 'mb-4']" data-testid="upstream-notice-error">
      <AppIcon name="alert" class="mt-0.5 h-4 w-4 shrink-0" />
      <span>{{ noticeError }}</span>
    </p>

    <p v-if="loading" class="text-sm text-gray-500 dark:text-gray-400">{{ t('common.loadingShort') }}</p>

    <div
      v-else-if="filtered.length === 0"
      class="flex flex-col items-center gap-3 py-10 text-center"
      data-testid="upstream-empty"
    >
      <span :class="emptyIcon"><AppIcon name="upload" class="h-6 w-6" /></span>
      <p class="m-0 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">
        {{ counts.total === 0 ? t('upstream.noItems') : t('upstream.noMatch') }}
      </p>
      <p v-if="counts.total === 0" class="m-0 max-w-md text-xs leading-5 text-gray-500 dark:text-gray-400">
        {{ t('upstream.noItemsHint') }}
      </p>
    </div>

    <div v-else :class="tableWrap">
      <table class="w-full border-collapse">
        <thead>
          <tr>
            <th :class="tableHead">{{ t('upstream.colItem') }}</th>
            <th :class="tableHead">{{ t('upstream.colBarcode') }}</th>
            <th :class="tableHead">{{ t('upstream.colStatus') }}</th>
            <th :class="tableHead">{{ t('upstream.colTransport') }}</th>
            <th :class="[tableHead, 'text-right']">{{ t('upstream.colAttempts') }}</th>
            <th :class="tableHead">{{ t('upstream.colLastAttempt') }}</th>
            <th :class="tableHead">{{ t('upstream.colSyncedAt') }}</th>
            <th :class="tableHead">{{ t('upstream.colRemoteRef') }}</th>
            <th :class="tableHead" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in paged" :key="row.id" data-testid="upstream-row" :data-item-id="row.catalogItemId">
            <td :class="[tableCell, 'min-w-0 max-w-[240px]']">
              <NuxtLink
                :to="`/items/${row.catalogItemId}`"
                class="truncate font-medium text-blue-700 no-underline hover:underline dark:text-blue-300"
                :title="nameOf(row)"
              >
                {{ nameOf(row) }}
              </NuxtLink>
            </td>
            <td :class="[tableCell, 'whitespace-nowrap font-mono text-xs text-gray-500 dark:text-gray-400']">
              {{ row.barcode || t('common.empty') }}
            </td>
            <td :class="[tableCell, 'whitespace-nowrap']">
              <UBadge :color="statusTone(row.status)" variant="soft" size="sm" :title="row.lastError || ''">
                {{ t(statusKey(row.status)) }}
              </UBadge>
            </td>
            <td :class="[tableCell, 'whitespace-nowrap text-xs text-gray-500 dark:text-gray-400']">
              {{ transportLabel(row) }}
            </td>
            <td :class="[tableCell, 'tabular text-right']">{{ row.attempts }}</td>
            <td :class="[tableCell, 'whitespace-nowrap font-mono text-xs text-gray-500 dark:text-gray-400']">
              {{ row.lastAttemptAt ? shortTime(row.lastAttemptAt) : t('upstream.never') }}
            </td>
            <td :class="[tableCell, 'whitespace-nowrap font-mono text-xs text-gray-500 dark:text-gray-400']">
              {{ shortTime(row.syncedAt) }}
            </td>
            <td :class="[tableCell, 'whitespace-nowrap']">
              <UBadge :color="row.status === 'ok' ? 'neutral' : 'warning'" variant="soft" size="sm">
                {{ row.remoteRef || t('upstream.never') }}
              </UBadge>
            </td>
            <td :class="[tableCell, 'whitespace-nowrap']">
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  :class="rowLink"
                  data-testid="upstream-open"
                  :title="t('upstream.openAria', { name: nameOf(row) })"
                  @click="openDetail(row.id)"
                >
                  {{ t('upstream.open') }}
                  <AppIcon name="chevronRight" class="h-4 w-4" />
                </button>
                <button
                  type="button"
                  :class="rowLink"
                  data-testid="upstream-reset"
                  :title="t('upstream.resetHint')"
                  :disabled="busyId === row.id"
                  @click="resetRow(row)"
                >
                  <AppIcon name="refresh" class="h-4 w-4" />
                  {{ t('upstream.reset') }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Pager :page="page" :page-size="pageSize" :total="total" @update:page="goPage" />

    <!-- 上行载荷预览：抽屉式，不改路由（列表页的分页/筛选状态不该被详情读走再写回） -->
    <div
      v-if="detailOpen"
      class="fixed inset-0 z-40 bg-gray-900/40 backdrop-blur-sm dark:bg-black/60"
      data-testid="upstream-detail-overlay"
      @click.self="closeDetail"
    />
    <aside
      v-if="detailOpen"
      class="fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col overflow-y-auto border-l border-gray-200 bg-white p-6 shadow-xl sm:p-8 dark:border-gray-800 dark:bg-gray-950"
      data-testid="upstream-detail"
      role="dialog"
      aria-modal="true"
    >
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 class="m-0 text-lg font-semibold tracking-tight">{{ t('upstream.detailTitle') }}</h2>
          <p class="mt-1 mb-0 truncate font-mono text-xs text-gray-500 dark:text-gray-400">
            {{ detailPayload.data?.row.barcode || detailPayload.data?.row.name || '' }}
          </p>
        </div>
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          :aria-label="t('common.close')"
          data-testid="upstream-detail-close"
          @click="closeDetail"
        >
          <AppIcon name="close" class="h-4 w-4" />
        </UButton>
      </div>

      <p class="mt-2 mb-4 text-sm leading-6 text-gray-500 dark:text-gray-400">{{ t('upstream.detailHint') }}</p>

      <p v-if="detailError" :class="[errorNotice, 'mb-4']" data-testid="upstream-detail-error">
        <AppIcon name="alert" class="mt-0.5 h-4 w-4 shrink-0" />
        <span>{{ detailError }}</span>
      </p>
      <p v-else-if="detailLoading" class="text-sm text-gray-500 dark:text-gray-400">{{ t('upstream.detailLoading') }}</p>

      <template v-else-if="detailPayload.data">
        <div
          v-if="!detailPayload.data.payload"
          :class="[chip, 'mb-4']"
          data-testid="upstream-detail-empty"
        >
          {{ t('upstream.payloadEmpty') }}
        </div>

        <template v-else>
          <div class="mb-4 flex flex-wrap items-center gap-2">
            <span :class="chip">{{ t('upstream.payloadFormat', { format: detailPayload.data.payload.format }) }}</span>
            <span :class="chip">{{ t('upstream.payloadGeneratedAt', { time: shortTime(detailPayload.data.payload.generatedAt) }) }}</span>
            <span :class="chip">{{ t('upstream.payloadCount', { count: detailPayload.data.payload.count }) }}</span>
            <span :class="chip">
              {{ detailPayload.data.payload.items[0]?.imageUrls.length
                ? t('upstream.payloadImages', { count: detailPayload.data.payload.items[0]?.imageUrls.length ?? 0 })
                : t('upstream.payloadNoImages') }}
            </span>
          </div>

          <p v-if="detailPayload.data.row.lastError" :class="[errorNotice, 'mb-4']">
            <AppIcon name="alert" class="mt-0.5 h-4 w-4 shrink-0" />
            <span>{{ t('upstream.lastError') }}：{{ detailPayload.data.row.lastError }}</span>
          </p>

          <div v-for="entry in detailPayload.data.payload.items" :key="entry.id" class="mb-6">
            <dl class="m-0 grid gap-3 sm:grid-cols-2">
              <div>
                <dt class="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  {{ t('upstream.colItem') }}
                </dt>
                <dd class="m-0 mt-1 text-sm">{{ entry.name || t('common.empty') }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  {{ t('upstream.colBarcode') }}
                </dt>
                <dd class="m-0 mt-1 font-mono text-sm">{{ entry.barcode }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  {{ t('upstream.fieldCompleteness') }}
                </dt>
                <dd class="m-0 mt-1 flex flex-wrap gap-1.5">
                  <UBadge
                    v-for="field in missingOf(entry)"
                    :key="field"
                    color="warning"
                    variant="soft"
                    size="sm"
                  >
                    {{ t('upstream.missingField', { field }) }}
                  </UBadge>
                  <UBadge v-if="missingOf(entry).length === 0" color="success" variant="soft" size="sm">
                    {{ t('upstream.complete') }}
                  </UBadge>
                </dd>
              </div>
              <div>
                <dt class="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  {{ t('upstream.colTransport') }}
                </dt>
                <dd class="m-0 mt-1 text-sm">
                  {{ detailPayload.data.row.transport }}
                  <span class="tabular ml-2 text-xs text-gray-500 dark:text-gray-400">
                    {{ t('upstream.attemptsTimes', { count: detailPayload.data.row.attempts }) }}
                  </span>
                </dd>
              </div>
            </dl>

            <!-- 图片：上传过去的是这些 URL，能不能取到取决于照片存储是否可达 -->
            <div v-if="entry.imageUrls.length" class="mt-4">
              <p class="mb-2 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                {{ t('upstream.colImages') }}（{{ entry.imageUrls.length }}）
              </p>
              <div class="flex flex-wrap gap-2">
                <img
                  v-for="url in entry.imageUrls"
                  :key="url"
                  :src="url"
                  :alt="entry.name || entry.barcode"
                  class="h-20 w-20 rounded-xl border border-gray-200 object-cover dark:border-gray-800"
                />
              </div>
            </div>

            <div v-if="entry.attributes && Object.keys(entry.attributes).length" class="mt-4">
              <p class="mb-2 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                {{ t('upstream.payloadAttributes') }}
              </p>
              <div class="flex flex-wrap gap-2">
                <span v-for="(value, key) in entry.attributes" :key="key" :class="chip">
                  {{ key }}：{{ value }}
                </span>
              </div>
            </div>

            <div v-if="entry.provenance?.length" class="mt-4">
              <p class="mb-2 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                {{ t('upstream.payloadProvenance') }}
              </p>
              <ul class="m-0 list-none space-y-1 p-0">
                <li v-for="source in entry.provenance" :key="source.field" class="text-xs text-gray-500 dark:text-gray-400">
                  <span class="font-mono">{{ source.field }}</span>
                  · {{ source.label || t('common.empty') }}
                  · {{ shortTime(source.observedAt) }}
                </li>
              </ul>
            </div>
          </div>

          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            :label="t('upstream.payloadRaw')"
            data-testid="upstream-detail-raw"
            @click="rawOpen = !rawOpen"
          />
          <pre
            v-if="rawOpen"
            class="mt-3 max-h-96 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs leading-5 dark:border-gray-800 dark:bg-gray-950"
            data-testid="upstream-detail-json"
          >{{ rawPayload }}</pre>
        </template>
      </template>
    </aside>
  </div>
  </div>
</template>
