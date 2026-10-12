<script setup lang="ts">
import { ref, watch } from 'vue';
import ContributionList from '../components/ContributionList.vue';
import Pager from '../components/Pager.vue';
import { errorMessage, useApi } from '../composables/useApi';
import type { AdminContribution } from '../composables/useApi';
import { useAuthGate } from '../composables/useAuthGate';
import { useConfirm } from '../composables/useConfirm';

const api = useApi();
const { t } = useI18n();
const confirm = useConfirm();

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

/**
 * 单调递增的请求序号：并发/乱序返回时，只有最后一次 `load()` 有权写状态。
 * 过滤器会在每次 change 时触发一次 `load()`，慢的旧请求晚回来会把新结果覆盖掉，
 * 页面就会显示与当前筛选不符的列表 —— 这里靠 seq 把晚到的旧响应直接丢掉。
 */
let loadSeq = 0;

async function load(): Promise<void> {
  // 会话在 httpOnly cookie 里：绝不在 SSR 期请求管理接口（401 由 useApi 统一送回登录页）
  if (import.meta.server) return;
  const seq = ++loadSeq;
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
    if (seq !== loadSeq) return;
    entries.value = data.contributions;
    total.value = data.total;
  } catch (caught) {
    if (seq !== loadSeq) return;
    entries.value = [];
    total.value = 0;
    error.value = errorMessage(caught);
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

async function toggleBlock(entry: AdminContribution): Promise<void> {
  // 屏蔽是破坏性操作（受影响字段会立即重算），先二次确认；恢复保持一键。
  if (!entry.blocked) {
    const confirmed = await confirm({
      title: t('confirm.title'),
      message: t('audit.confirm.blockContribution', { id: entry.id }),
      tone: 'error',
    });
    if (!confirmed) return;
  }
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

/**
 * 例外：两个筛选控件刻意保留原生 `<select>`（e2e 直接驱动它），
 * 所以这里手写一份与 `UInput size="lg"` 对齐的外观（同样的圆角/ring/字号）。
 */
const select =
  'w-full rounded-md bg-white px-3 py-2 text-base/5 text-gray-900 ring-1 ring-inset ring-gray-300 transition-colors outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-900 dark:text-white dark:ring-gray-700';
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

  <AppCard data-testid="card">
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <UFormField :label="t('audit.filterSource')">
        <select v-model="source" :class="select" data-testid="audit-source" @change="applyFilters">
          <option value="">{{ t('common.all') }}</option>
          <option value="api">{{ t('audit.filterSourceApi') }}</option>
          <option value="admin">{{ t('audit.filterSourceAdmin') }}</option>
        </select>
      </UFormField>
      <UFormField :label="t('audit.filterVisibility')">
        <select v-model="blocked" :class="select" data-testid="audit-visibility" @change="applyFilters">
          <option value="">{{ t('common.all') }}</option>
          <option value="visible">{{ t('audit.visibilityVisible') }}</option>
          <option value="blocked">{{ t('audit.visibilityBlocked') }}</option>
        </select>
      </UFormField>
      <UFormField :label="t('audit.filterItemId')">
        <UInput
          v-model="itemId"
          size="lg"
          class="w-full font-mono"
          data-testid="audit-item-id"
          inputmode="numeric"
          :placeholder="t('audit.filterItemIdPlaceholder')"
          @keyup.enter="applyFilters"
        />
      </UFormField>
      <UFormField :label="t('audit.filterInstanceId')">
        <UInput
          v-model="instanceId"
          size="lg"
          class="w-full font-mono"
          data-testid="audit-instance-id"
          inputmode="numeric"
          :placeholder="t('audit.filterInstanceIdPlaceholder')"
          @keyup.enter="applyFilters"
        />
      </UFormField>
    </div>
    <div class="mt-4 flex flex-wrap items-center gap-2.5">
      <UButton color="primary" size="lg" data-testid="audit-apply" type="button" :disabled="loading" @click="applyFilters">
        {{ t('common.apply') }}
      </UButton>
      <span class="flex-1" />
      <span v-if="loading" class="text-sm text-gray-500 dark:text-gray-400">{{ t('common.loadingShort') }}</span>
    </div>
  </AppCard>

  <AppNotice v-if="error" tone="error" class="mt-4" data-testid="notice">{{ error }}</AppNotice>
  <AppNotice v-if="notice" tone="success" class="mt-4" data-testid="notice">{{ notice }}</AppNotice>

  <div class="mt-6">
    <ContributionList
      v-if="loading || entries.length > 0"
      :contributions="entries"
      admin
      :busy-id="busyId"
      @toggle-block="toggleBlock"
    />
    <AppEmpty v-else icon="clipboard">{{ t('item.contribution.empty') }}</AppEmpty>
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
