<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Pager from '../components/Pager.vue';
import { capture, INITIAL_SOURCE_WEIGHT, useApi } from '../composables/useApi';
import type { Loaded, SourceListPage } from '../composables/useApi';
import { adminSession } from '../composables/useAdminSession';
import { useAuthGate } from '../composables/useAuthGate';

const api = useApi();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();

/** 未确认登录前不渲染页面内容（见 useAuthGate 的说明）。 */
const { ready, checking } = useAuthGate();

/** 需要登录：守卫是全局中间件 `login-gate`，未登录会被送到 /login?redirect=/sources。 */
// 登录守卫由全局中间件 `login-gate` 负责（见 nuxt.config 的 app.middleware），
// 这里不再逐页挂 —— 逐页挂漏一个就是静默对外开放。

const pageSize = 20;

/**
 * 判断"多低算可疑"的基准值。
 *
 * 取服务端随会话下发的配置，而不是写死 1 —— 它是可配的（`COLLECTOR_WEIGHT_INITIAL`），
 * 写死会让改过配置的部署在界面上判错。会话还没到（首屏）时先用量默认值兜底。
 */
const baseline = computed(() => adminSession.weightInitial ?? INITIAL_SOURCE_WEIGHT);

/**
 * 分页与「只看可疑来源」都放在 URL 查询串里（和 / 的 q、page 一样）：服务端与客户端读的是同一份
 * 状态，SSR 出来的 HTML 和客户端首帧对得上，刷新/分享链接也还停在同一个视图上。
 */
const page = computed(() => Number(route.query.page ?? 1) || 1);
const suspicious = computed(() => route.query.suspicious === 'true');

/**
 * 管理接口要 httpOnly cookie：SSR 期在服务端请求只会白拿一个 401，useApi 会顺手把人甩去登录页。
 * 所以服务端先渲染一个空列表，等挂载后再真正取数 —— 和 audit.vue 的 `if (import.meta.server) return`
 * 是同一条规矩，只是这里要落进 useAsyncData，所以改成用一个挂载标记把首次请求挡住。
 */
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});

const { data, pending } = await useAsyncData<Loaded<SourceListPage>>(
  () => `sources-${page.value}-${suspicious.value}`,
  () =>
    mounted.value
      ? capture(() => api.admin.sources(page.value, pageSize, suspicious.value))
      : Promise.resolve<Loaded<SourceListPage>>({ data: null, error: '', status: 0 }),
  {
    watch: [page, suspicious, mounted],
    default: (): Loaded<SourceListPage> => ({ data: null, error: '', status: 0 }),
  },
);

const sources = computed(() => data.value?.data?.sources ?? []);
const total = computed(() => data.value?.data?.total ?? 0);
const error = computed(() => data.value?.error ?? '');
const loading = computed(() => pending.value);

/** 类型是服务端的枚举值，界面说人话；将来加了新类型就直接显示原值，不假装认识它。 */
function kindLabel(kind: string | null): string {
  if (!kind) return t('common.empty');
  if (kind === 'reported') return t('sources.kindReported');
  if (kind === 'fingerprint') return t('sources.kindFingerprint');
  return kind;
}

/** 权重徽标：低于基准＝可疑（警告色），高于基准＝可信（成功色），正好等于基准时不着色（那是默认状态）。 */
function weightTone(weight: number): 'warning' | 'success' | 'neutral' {
  if (weight < baseline.value) return 'warning';
  if (weight > baseline.value) return 'success';
  return 'neutral';
}

function shortTime(value: string | null): string {
  if (!value) return t('common.empty');
  return value.replace('T', ' ').slice(0, 16);
}

/**
 * 翻页/切筛选都写回查询串（而不是本地 ref）：useAsyncData 的 watch 盯的是 route.query，
 * 改 URL 就等于改数据源，浏览器前进/后退也能正确回到上一屏。
 */
async function goPage(value: number): Promise<void> {
  await router.push({ query: { ...route.query, page: value > 1 ? String(value) : undefined } });
}

async function toggleSuspicious(): Promise<void> {
  await router.push({
    query: { ...route.query, suspicious: suspicious.value ? undefined : 'true', page: undefined },
  });
}

useHead({ title: computed(() => t('sources.title')) });

const card = 'rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900';
/** 宽表格的小屏策略：外层 overflow-x-auto 兜住，桌面端不出现横向滚动条 */
const tableWrap = 'w-full max-w-full overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900';
const tableHead = 'whitespace-nowrap border-b border-gray-200 bg-gray-50 px-3 py-2.5 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-400';
const tableCell = 'border-b border-gray-200 px-3 py-2.5 align-top text-sm dark:border-gray-800';
const rowLink =
  'inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 no-underline transition-colors duration-150 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800';
const errorNotice = 'flex items-start gap-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400';
/** 空状态按规范 §6.9：圆形浅蓝图标容器 + 一句灰字 + 下一步动作 */
const emptyIcon = 'grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300';
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
  <div data-testid="sources-page">
    <div data-testid="page-head" class="flex flex-wrap items-baseline gap-3">
      <h1 class="m-0 text-2xl font-semibold tracking-tight">{{ t('sources.heading') }}</h1>
      <UBadge v-if="total > 0" color="neutral" variant="soft" size="sm">{{ t('sources.count', { count: total }) }}</UBadge>
    </div>
    <p class="mt-2 mb-6 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
      {{ t('sources.intro') }}
    </p>

    <div :class="[card, 'flex flex-wrap items-center gap-3']">
      <label class="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          :checked="suspicious"
          data-testid="sources-suspicious"
          type="checkbox"
          class="h-4 w-4 rounded border-gray-300 text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-gray-700 dark:bg-gray-900"
          :disabled="loading"
          @change="toggleSuspicious"
        />
        {{ t('sources.onlySuspicious') }}
      </label>
      <span class="text-xs leading-5 text-gray-500 dark:text-gray-400">
        {{ t('sources.suspiciousHint', { baseline: baseline.toFixed(2) }) }}
      </span>
      <span class="flex-1" />
      <span v-if="loading" class="text-sm text-gray-500 dark:text-gray-400">{{ t('common.loadingShort') }}</span>
    </div>

    <p v-if="error" :class="[errorNotice, 'mt-4']" data-testid="sources-error">
      <AppIcon name="alert" class="mt-0.5 h-4 w-4 shrink-0" />
      <span>{{ error }}</span>
    </p>

    <div
      v-else-if="!loading && sources.length === 0"
      class="mt-6 flex flex-col items-center gap-3 py-10 text-center"
      data-testid="sources-empty"
    >
      <span :class="emptyIcon"><AppIcon name="shield" class="h-6 w-6" /></span>
      <p class="m-0 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">{{ t('sources.empty') }}</p>
    </div>

    <div v-else :class="[tableWrap, 'mt-4']">
      <table class="w-full border-collapse">
        <thead>
          <tr>
            <th :class="tableHead">{{ t('sources.columnSource') }}</th>
            <th :class="tableHead">{{ t('sources.columnKind') }}</th>
            <th :class="[tableHead, 'text-right']">{{ t('sources.weightLabel') }}</th>
            <th :class="tableHead">{{ t('sources.trend') }}</th>
            <th :class="[tableHead, 'text-right']">{{ t('sources.evidence') }}</th>
            <th :class="[tableHead, 'text-right']">{{ t('sources.columnItem') }}</th>
            <th :class="[tableHead, 'text-right']">{{ t('sources.columnIpCount') }}</th>
            <th :class="tableHead">{{ t('sources.columnLastObserved') }}</th>
            <th :class="tableHead" />
          </tr>
        </thead>
        <tbody>
          <!-- 服务端已经按权重升序返回（可疑的排前面），这里不再重排 -->
          <tr v-for="row in sources" :key="row.sourceKey" data-testid="sources-row">
            <td :class="[tableCell, 'max-w-[220px] truncate font-mono text-xs']" :title="row.sourceKey">
              {{ row.sourceKey }}
            </td>
            <td :class="[tableCell, 'whitespace-nowrap']">
              <UBadge v-if="row.kind" color="neutral" variant="soft" size="sm">{{ kindLabel(row.kind) }}</UBadge>
              <span v-else class="text-gray-400 dark:text-gray-500">{{ t('common.empty') }}</span>
            </td>
            <td :class="[tableCell, 'text-right']">
              <UBadge
                :color="weightTone(row.weight)"
                variant="soft"
                size="sm"
                :title="t('sources.baselineTooltip', { baseline: baseline.toFixed(2) })"
              >
                <span class="tabular">{{ row.weight.toFixed(2) }}</span>
              </UBadge>
            </td>
            <td :class="[tableCell, 'whitespace-nowrap']">
              <UBadge :color="row.upvotes === 0 ? 'neutral' : 'success'" variant="soft" size="sm">
                {{ t('sources.upvotes', { count: row.upvotes }) }}
              </UBadge>
              <UBadge :color="row.downvotes === 0 ? 'neutral' : 'warning'" variant="soft" size="sm" class="ml-1">
                {{ t('sources.downvotes', { count: row.downvotes }) }}
              </UBadge>
            </td>
            <td :class="[tableCell, 'tabular text-right']">{{ row.observations }}</td>
            <td :class="[tableCell, 'tabular text-right']">{{ row.items }}</td>
            <td :class="[tableCell, 'text-right']">
              <UBadge
                v-if="row.ipHashes > 1"
                color="warning"
                variant="soft"
                size="sm"
                :title="t('sources.ipTooltip')"
              >
                <span class="tabular">{{ t('sources.ipCount', { count: row.ipHashes }) }}</span>
              </UBadge>
              <span v-else class="tabular">{{ row.ipHashes }}</span>
            </td>
            <td :class="[tableCell, 'whitespace-nowrap font-mono text-xs text-gray-500 dark:text-gray-400']">{{ shortTime(row.lastObservedAt) }}</td>
            <td :class="[tableCell, 'whitespace-nowrap']">
              <NuxtLink
                :class="rowLink"
                data-testid="sources-open"
                :to="`/sources/${encodeURIComponent(row.sourceKey)}`"
              >
                {{ t('common.view') }}
                <AppIcon name="chevronRight" class="h-4 w-4" />
              </NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Pager :page="page" :page-size="pageSize" :total="total" @update:page="goPage" />
  </div>
  </div>
</template>
