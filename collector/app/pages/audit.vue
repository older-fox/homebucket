<script setup lang="ts">
import { ref, watch } from 'vue';
import ContributionList from '../components/ContributionList.vue';
import Pager from '../components/Pager.vue';
import { errorMessage, useApi } from '../composables/useApi';
import type { AdminContribution } from '../composables/useApi';
import { useAuthGate } from '../composables/useAuthGate';

const api = useApi();
const { t } = useI18n();

/** 未确认登录前不渲染页面内容（见 useAuthGate 的说明）。 */
const { ready, checking } = useAuthGate();

/** 需要登录：守卫是全局中间件 `login-gate`，未登录会被送到 /login?redirect=/audit。 */
// 登录守卫由全局中间件 `login-gate` 负责（见 nuxt.config 的 app.middleware），
// 这里不再逐页挂 —— 逐页挂漏一个就是静默对外开放。

const entries = ref<AdminContribution[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const source = ref('');
const blocked = ref('');
const itemId = ref('');
const instanceId = ref('');
const loading = ref(false);
const busyId = ref<number | null>(null);
const error = ref('');
const notice = ref('');

async function load(): Promise<void> {
  // 会话在 httpOnly cookie 里：绝不在 SSR 期请求管理接口（401 由 useApi 统一送回登录页）
  if (import.meta.server) return;
  loading.value = true;
  error.value = '';
  try {
    const data = await api.admin.contributions({
      page: page.value,
      pageSize,
      source: source.value || undefined,
      blocked: blocked.value === '' ? undefined : blocked.value === 'blocked',
      itemId: itemId.value ? Number(itemId.value) : undefined,
      instanceId: instanceId.value ? Number(instanceId.value) : undefined,
    });
    entries.value = data.contributions;
    total.value = data.total;
  } catch (caught) {
    entries.value = [];
    total.value = 0;
    error.value = errorMessage(caught);
  } finally {
    loading.value = false;
  }
}

async function toggleBlock(entry: AdminContribution): Promise<void> {
  busyId.value = entry.id;
  notice.value = '';
  error.value = '';
  try {
    const result = await api.admin.blockContribution(
      entry.id,
      !entry.blocked,
      entry.blocked ? undefined : t('errors.blockedReason'),
    );
    notice.value = t('audit.toggleNotice', {
      action: entry.blocked ? t('audit.restored') : t('audit.blocked'),
      id: entry.id,
      item: result.item.name ?? result.item.id,
    });
    await load();
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    busyId.value = null;
  }
}

function applyFilters(): void {
  page.value = 1;
  void load();
}

/**
 * 会话确认后才拉流水。
 *
 * 这里**必须** watch `ready`，不能写成 `onMounted(() => { if (adminSession.user) load() })`：
 * `useAuthGate()` 要等 `/api/admin/session` 回来才知道有没有登录，而它内部的
 * `onMounted` 与页面里的 `onMounted` 谁先执行并不确定。页面的先跑时
 * `adminSession.user` 还是 null，列表就永远不加载 —— 表现为"明明登录着进来，
 * 页面却一直空白"。`ready` 是 gate 给出的"已确认登录"信号，等它才没有竞态。
 * 请求途中若会话失效（401），useApi 会把人送回 /login?redirect=…
 */
watch(ready, async (ok) => {
  if (ok) await load();
});

useHead({ title: computed(() => t('audit.title')) });

const card = 'rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900';
const input =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors duration-150 outline-none placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500';
const label = 'mb-1.5 block text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400';
const primaryButton =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-gray-950';
const errorNotice = 'flex items-start gap-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400';
const okNotice = 'flex items-start gap-2 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400';
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
  <div data-testid="page-head" class="flex flex-wrap items-baseline gap-3">
    <h1 class="m-0 text-2xl font-semibold tracking-tight">{{ t('audit.title') }}</h1>
    <UBadge color="neutral" variant="soft" size="sm">{{ t('common.totalCount', { count: total }) }}</UBadge>
  </div>
  <p class="mt-2 mb-6 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
    {{ t('audit.intro') }}
  </p>

  <div :class="card" data-testid="card">
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label class="block">
        <span :class="label">{{ t('audit.filterSource') }}</span>
        <select v-model="source" :class="input" data-testid="audit-source" @change="applyFilters">
          <option value="">{{ t('common.all') }}</option>
          <option value="api">{{ t('audit.filterSourceApi') }}</option>
          <option value="admin">{{ t('audit.filterSourceAdmin') }}</option>
        </select>
      </label>
      <label class="block">
        <span :class="label">{{ t('audit.filterVisibility') }}</span>
        <select v-model="blocked" :class="input" data-testid="audit-visibility" @change="applyFilters">
          <option value="">{{ t('common.all') }}</option>
          <option value="visible">{{ t('audit.visibilityVisible') }}</option>
          <option value="blocked">{{ t('audit.visibilityBlocked') }}</option>
        </select>
      </label>
      <label class="block">
        <span :class="label">{{ t('audit.filterItemId') }}</span>
        <input
          v-model="itemId"
          :class="[input, 'font-mono']"
          data-testid="audit-item-id"
          inputmode="numeric"
          :placeholder="t('audit.filterItemIdPlaceholder')"
          @keyup.enter="applyFilters"
        />
      </label>
      <label class="block">
        <span :class="label">{{ t('audit.filterInstanceId') }}</span>
        <input
          v-model="instanceId"
          :class="[input, 'font-mono']"
          data-testid="audit-instance-id"
          inputmode="numeric"
          :placeholder="t('audit.filterInstanceIdPlaceholder')"
          @keyup.enter="applyFilters"
        />
      </label>
    </div>
    <div class="mt-4 flex flex-wrap items-center gap-2.5">
      <button :class="primaryButton" data-testid="audit-apply" type="button" :disabled="loading" @click="applyFilters">
        {{ t('common.apply') }}
      </button>
      <span class="flex-1" />
      <span v-if="loading" class="text-sm text-gray-500 dark:text-gray-400">{{ t('common.loadingShort') }}</span>
    </div>
  </div>

  <p v-if="error" :class="[errorNotice, 'mt-4']" data-testid="notice">
    <AppIcon name="alert" class="mt-0.5 h-4 w-4 shrink-0" />
    <span>{{ error }}</span>
  </p>
  <p v-if="notice" :class="[okNotice, 'mt-4']" data-testid="notice">
    <AppIcon name="check" class="mt-0.5 h-4 w-4 shrink-0" />
    <span>{{ notice }}</span>
  </p>

  <div class="mt-6">
    <ContributionList :contributions="entries" admin :busy-id="busyId" @toggle-block="toggleBlock" />
  </div>

  <Pager
    :page="page"
    :page-size="pageSize"
    :total="total"
    @update:page="
      (value) => {
        page = value;
        load();
      }
    "
  />
  </div>
</template>
