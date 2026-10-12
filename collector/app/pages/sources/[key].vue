<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { capture, errorMessage, INITIAL_SOURCE_WEIGHT, useApi } from '../../composables/useApi';
import { adminSession } from '../../composables/useAdminSession';
import type { Loaded, SourceDetail } from '../../composables/useApi';
import { useAuthGate } from '../../composables/useAuthGate';
import { tableCell, tableHead, tableScroll, tableWrap } from '~/utils/ui';

const api = useApi();
const { t } = useI18n();

/** 未确认登录前不渲染页面内容（见 useAuthGate 的说明）。 */
const { ready, checking } = useAuthGate();

/**
 * 权重基准值＝服务端配置（`COLLECTOR_WEIGHT_INITIAL`），随会话下发。
 * "恢复基准值"要恢复到它，而不是恢复到前端常量 —— 否则改过配置的部署会被"恢复"歪。
 */
const baseline = computed(() => adminSession.weightInitial ?? INITIAL_SOURCE_WEIGHT);
const route = useRoute();

/** 需要登录：守卫是全局中间件 `login-gate`，未登录会被送到 /login?redirect=/sources/<key>。 */
// 登录守卫由全局中间件 `login-gate` 负责（见 nuxt.config 的 app.middleware），
// 这里不再逐页挂 —— 逐页挂漏一个就是静默对外开放。

const sourceKey = computed(() => String(route.params.key ?? ''));

/**
 * 管理接口在 httpOnly cookie 之后，SSR 期拿不到浏览器会话，所以先渲染空壳，
 * 挂载之后再真正取数（直接 SSR 请求只会白拿一个 401 并把人甩回登录页）。
 */
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});

const { data, pending, refresh } = await useAsyncData<Loaded<SourceDetail>>(
  () => `source-${sourceKey.value}`,
  () =>
    mounted.value
      ? capture(() => api.admin.source(sourceKey.value))
      : Promise.resolve({ data: null, error: '', status: 0 }),
  {
    watch: [sourceKey, mounted],
    default: (): Loaded<SourceDetail> => ({ data: null, error: '', status: 0 }),
  },
);

const detail = computed(() => data.value?.data ?? null);
/** 服务端用 code=source.notFound 表示「没有这个来源」（HTTP 404）：这不是错误，是一种正常答案。 */
const missing = computed(() => data.value?.status === 404);
const error = computed(() => (missing.value ? '' : data.value?.error ?? ''));
const loading = computed(() => pending.value);

/* ---------- 手工设权重 ---------- */
const weightInput = ref('');
const busy = ref('');
const notice = ref('');
const weightError = ref('');

/** 详情刷新后把输入框拉回当前权重，避免输入框停在上一次提交的值上。 */
watch(
  detail,
  (value) => {
    weightInput.value = value ? value.weight.toFixed(2) : '';
  },
  { immediate: true },
);

async function submitWeight(value: number): Promise<void> {
  if (validateWeight(value)) return;
  busy.value = 'weight';
  notice.value = '';
  weightError.value = '';
  try {
    const updated = await api.admin.setSourceWeight(sourceKey.value, value);
    // 服务端回的是重算后的完整详情：直接替换本地状态，不再自己拼一遍。
    data.value = { data: updated, error: '', status: 200 };
    notice.value = t('sources.weightSaved', { weight: updated.weight.toFixed(2) });
  } catch (caught) {
    weightError.value = errorMessage(caught);
  } finally {
    busy.value = '';
  }
}

function saveWeight(): void {
  const value = Number(weightInput.value);
  void submitWeight(value);
}

/** 恢复基准值＝把初始权重重新提交一次（服务端没有「删除覆盖」的接口）。 */
function resetWeight(): void {
  // "恢复基准值"恢复的是**服务端配置的**基准值，不是前端常量
  weightInput.value = baseline.value.toFixed(2);
  void submitWeight(baseline.value);
}

/** 权重是 0–5 的数字；NaN（输入框被清空）走同一条提示。 */
function validateWeight(value: number): boolean {
  if (!Number.isFinite(value) || value < 0 || value > 5) {
    weightError.value = t('sources.weightInvalid');
    return true;
  }
  weightError.value = '';
  return false;
}

/* ---------- 复制来源键 ---------- */
const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 剪贴板只在浏览器里有：import.meta.server 时直接放弃，
 * 并且失败的写入（非 https、权限被拒）也不能把「已复制」显示出来。
 */
async function copyKey(): Promise<void> {
  if (!import.meta.client) return;
  try {
    await navigator.clipboard.writeText(sourceKey.value);
    copied.value = true;
    if (copiedTimer !== null) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copied.value = false;
      copiedTimer = null;
    }, 1500);
  } catch {
    copied.value = false;
  }
}

/** 组件卸载时清掉挂起的定时器：否则它会在别处 setState（Vue 会警告，值也没地方显示）。 */
onBeforeUnmount(() => {
  if (copiedTimer !== null) clearTimeout(copiedTimer);
});

/* ---------- 展示辅助 ---------- */
/** 类型是服务端的枚举值，界面说人话；将来加了新类型就直接显示原值，不假装认识它。 */
function kindLabel(kind: string | null): string {
  if (!kind) return t('common.empty');
  if (kind === 'reported') return t('sources.kindReported');
  if (kind === 'fingerprint') return t('sources.kindFingerprint');
  return kind;
}

/** 权重徽标：高于基准＝可信（成功色），等于/低于基准＝中性色 —— 规范只允许 success/neutral。 */
function weightTone(weight: number): 'success' | 'neutral' {
  return weight > baseline.value ? 'success' : 'neutral';
}

function shortTime(value: string | null): string {
  if (!value) return t('common.empty');
  return value.replace('T', ' ').slice(0, 16);
}

/** 没有物品名时退回 #ID：这条记录只带了 catalogItemId，拿不到条码所以做不了链接。 */
function itemLabel(itemName: string | null, catalogItemId: number): string {
  return itemName || `#${catalogItemId}`;
}

useHead({ title: computed(() => t('sources.detailTitle')) });
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
  <div class="flex flex-wrap items-center gap-2.5">
    <UButton to="/sources" variant="outline" color="neutral">{{ t('sources.backToList') }}</UButton>
  </div>

  <AppNotice v-if="error" tone="error" class="mt-4" data-testid="source-error">{{ error }}</AppNotice>
  <p v-else-if="loading" class="mt-4 text-sm text-gray-500 dark:text-gray-400">{{ t('common.loadingShort') }}</p>

  <AppEmpty v-else-if="missing" icon="shield" class="mt-4" data-testid="source-missing">
    <span class="block font-medium text-gray-900 dark:text-white">{{ t('sources.missingTitle') }}</span>
    <span class="mt-1 block">{{ t('sources.missingHint', { key: sourceKey }) }}</span>
    <template #actions>
      <UButton to="/sources" variant="outline" color="neutral">{{ t('sources.backToList') }}</UButton>
    </template>
  </AppEmpty>

  <template v-if="detail">
    <div data-testid="source-detail" class="mt-5 flex flex-wrap items-center gap-2.5">
      <h1 class="m-0 font-mono text-2xl font-semibold break-all tracking-tight">{{ detail.sourceKey }}</h1>
      <UButton variant="outline" color="neutral" data-testid="source-copy" @click="copyKey">
        <template #leading>
          <AppIcon name="copy" class="h-4 w-4" />
        </template>
        {{ copied ? t('sources.copied') : t('sources.copyKey') }}
      </UButton>
      <span class="flex-1" />
      <UButton to="/sources" variant="outline" color="neutral">{{ t('sources.backToList') }}</UButton>
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-1.5">
      <UBadge
        :color="weightTone(detail.weight)"
        variant="soft"
        size="sm"
        :title="t('sources.baselineTooltip', { baseline: baseline.toFixed(2) })"
      >
        <span class="font-mono tabular">{{ t('sources.weightChip', { weight: detail.weight.toFixed(2) }) }}</span>
      </UBadge>
      <UBadge color="success" variant="soft" size="sm" class="tabular">{{ t('sources.upvotes', { count: detail.upvotes }) }}</UBadge>
      <UBadge color="neutral" variant="soft" size="sm" class="tabular">
        {{ t('sources.downvotes', { count: detail.downvotes }) }}
      </UBadge>
      <UBadge color="neutral" variant="soft" size="sm" class="tabular">
        {{ t('sources.observationsAndCoverage', { count: detail.observations, items: detail.items }) }}
      </UBadge>
      <UBadge
        color="neutral"
        variant="soft"
        size="sm"
        :title="t('sources.ipTooltip')"
      >
        <span class="tabular">{{ t('sources.ipCount', { count: detail.ipHashes }) }}</span>
      </UBadge>
      <UBadge color="neutral" variant="soft" size="sm">{{ t('sources.kind', { kind: kindLabel(detail.kind) }) }}</UBadge>
      <UBadge color="neutral" variant="soft" size="sm">
        {{ t('sources.lastObserved', { time: shortTime(detail.lastObservedAt) }) }}
      </UBadge>
    </div>

    <p class="mt-4 mb-0 max-w-4xl text-sm leading-6 text-gray-500 dark:text-gray-400">
      {{ t('sources.caveats') }}
    </p>

    <AppCard :title="t('sources.manualWeight')" class="mt-6">
      <p class="mt-0 mb-3 text-sm leading-6 text-gray-500 dark:text-gray-400">
        {{ t('sources.manualWeightHint', { baseline: baseline.toFixed(2) }) }}
      </p>
      <div class="flex flex-wrap items-end gap-2.5">
        <UFormField :label="t('sources.weightLabel')" class="w-[140px]">
          <UInput
            v-model="weightInput"
            data-testid="source-weight-input"
            size="lg"
            type="number"
            step="0.05"
            min="0"
            max="5"
            inputmode="decimal"
            class="w-full"
            @keyup.enter="saveWeight"
          />
        </UFormField>
        <UButton color="primary" data-testid="source-weight-save" :disabled="busy === 'weight'" @click="saveWeight">
          {{ busy === 'weight' ? t('common.saving') : t('common.save') }}
        </UButton>
        <UButton variant="outline" color="neutral" data-testid="source-weight-reset" :disabled="busy === 'weight'" @click="resetWeight">
          {{ t('sources.resetBaseline') }}
        </UButton>
      </div>
      <AppNotice v-if="weightError" tone="error" class="mt-4" data-testid="source-error">{{ weightError }}</AppNotice>
      <AppNotice v-if="notice" tone="success" class="mt-4" data-testid="source-notice">{{ notice }}</AppNotice>
    </AppCard>

    <AppCard :title="t('sources.feedbackHeading', { count: detail.feedback.length })" class="mt-4">
      <p class="mt-0 mb-3 text-sm leading-6 text-gray-500 dark:text-gray-400">{{ t('sources.feedbackHint') }}</p>
      <div :class="[tableWrap, tableScroll]">
        <table class="w-full border-collapse">
          <thead>
            <tr>
              <th :class="tableHead">{{ t('sources.columnItem') }}</th>
              <th :class="tableHead">{{ t('sources.columnField') }}</th>
              <th :class="tableHead">{{ t('sources.columnObservedValue') }}</th>
              <th :class="tableHead">{{ t('sources.columnVerdict') }}</th>
              <th :class="tableHead">{{ t('sources.columnNote') }}</th>
              <th :class="tableHead">{{ t('common.time') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in detail.feedback" :key="row.id" data-testid="source-feedback-row">
              <!-- 这里只有 catalogItemId，没有条码，所以做不出 /items/<barcode> 的链接 -->
              <td :class="tableCell">{{ itemLabel(row.itemName, row.catalogItemId) }}</td>
              <td :class="[tableCell, 'whitespace-nowrap font-mono text-xs']">{{ row.field }}</td>
              <td :class="[tableCell, 'max-w-[320px] font-mono text-xs break-all']" :title="row.value ?? ''">
                {{ row.value || t('common.empty') }}
              </td>
              <td :class="[tableCell, 'whitespace-nowrap']">
                <UBadge :color="row.accurate ? 'success' : 'neutral'" variant="soft" size="sm">
                  {{ row.accurate ? t('sources.accurate') : t('sources.inaccurate') }}
                </UBadge>
              </td>
              <td :class="[tableCell, 'max-w-[240px] break-all']">{{ row.note || t('common.empty') }}</td>
              <td :class="[tableCell, 'whitespace-nowrap font-mono text-xs text-gray-500 dark:text-gray-400']">{{ shortTime(row.createdAt) }}</td>
            </tr>
            <tr v-if="detail.feedback.length === 0">
              <td :class="[tableCell, 'text-center text-gray-500 dark:text-gray-400']" colspan="6">
                {{ t('sources.feedbackEmpty') }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppCard>

    <AppCard :title="t('sources.recentHeading', { count: detail.recent.length })" class="mt-4">
      <p class="mt-0 mb-3 text-sm leading-6 text-gray-500 dark:text-gray-400">{{ t('sources.recentHint') }}</p>
      <div :class="[tableWrap, tableScroll]">
        <table class="w-full border-collapse">
          <thead>
            <tr>
              <th :class="tableHead">{{ t('sources.columnItem') }}</th>
              <th :class="tableHead">{{ t('sources.columnField') }}</th>
              <th :class="tableHead">{{ t('sources.columnValue') }}</th>
              <th :class="[tableHead, 'text-right']">{{ t('sources.columnWeightAtTime') }}</th>
              <th :class="tableHead">{{ t('common.time') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in detail.recent" :key="row.id" data-testid="source-recent-row">
              <td :class="tableCell">
                <NuxtLink
                  v-if="row.barcode"
                  class="font-mono text-xs text-blue-700 no-underline hover:underline dark:text-blue-300"
                  :to="`/items/${encodeURIComponent(row.barcode)}`"
                >
                  {{ row.barcode }}
                </NuxtLink>
                <span class="block">{{ itemLabel(row.itemName, row.catalogItemId) }}</span>
              </td>
              <td :class="[tableCell, 'whitespace-nowrap font-mono text-xs']">{{ row.field }}</td>
              <td :class="[tableCell, 'max-w-[420px] font-mono text-xs break-all']" :title="row.value">{{ row.value }}</td>
              <!-- 这是写入这条证据时记下的权重快照，故意不等于当前权重：它解释「当时这条证据有多重」 -->
              <td :class="[tableCell, 'text-right font-mono tabular']">{{ row.weightAtObservation.toFixed(2) }}</td>
              <td :class="[tableCell, 'whitespace-nowrap font-mono text-xs text-gray-500 dark:text-gray-400']">{{ shortTime(row.observedAt) }}</td>
            </tr>
            <tr v-if="detail.recent.length === 0">
              <td :class="[tableCell, 'text-center text-gray-500 dark:text-gray-400']" colspan="5">
                {{ t('sources.noEvidence') }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppCard>
  </template>
  </div>
</template>
