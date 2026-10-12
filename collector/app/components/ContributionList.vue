<script setup lang="ts">
import type { AdminContribution, ContributionView } from '../composables/useApi';

const props = defineProps<{
  contributions: Array<ContributionView | AdminContribution>;
  admin?: boolean;
  busyId?: number | null;
}>();

const emit = defineEmits<{ (e: 'toggleBlock', entry: AdminContribution): void }>();

const { t } = useI18n();

function isAdmin(entry: ContributionView | AdminContribution): entry is AdminContribution {
  return 'blocked' in entry;
}

function sourceLabel(entry: ContributionView): string {
  if (entry.source === 'admin') return t('errors.adminSource');
  return entry.instanceName ?? (entry.instanceId === null ? t('errors.sourceUnknown') : t('errors.instance', { id: entry.instanceId }));
}

function shortTime(value: string): string {
  return value.replace('T', ' ').slice(0, 19);
}

/**
 * 流水内容用 JSON.stringify 原样呈现：这是"账本"，不是给人看的界面文案 ——
 * 把 payload 翻译成人话反而会让审计时看不到真正落库的字段。
 * 空对象走 i18n（`{}（这次没有新内容）` 里的 `{}` 是文案的一部分，不是插值洞）。
 */
function payloadText(entry: ContributionView): string {
  const only = Object.fromEntries(
    Object.entries(entry.payload).filter(
      ([, value]) => value !== null && value !== '' && !(Array.isArray(value) && value.length === 0),
    ),
  );
  return Object.keys(only).length > 0 ? JSON.stringify(only, null, 2) : t('item.contribution.nothingYet');
}

/**
 * 每条流水的角色分两类：普通视图只需要看得懂，管理视图还要能屏蔽/恢复。
 * 屏蔽按钮用的仍是原生 button（不是 UButton），因为 e2e 依赖 :data-testid 在按钮自身、
 * 且要在行内可见可点 —— UButton 会把属性透传到内部 <button>，但这里保持原生更直白。
 */
const blockButton = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50';
const blockDanger = 'bg-red-600 text-white hover:bg-red-700';
const blockRestore = 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700';
</script>

<template>
  <div class="grid gap-2.5">
    <article
      v-for="entry in props.contributions"
      :key="entry.id"
      data-testid="contribution"
      class="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
      :class="{ 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40': isAdmin(entry) && entry.blocked }"
    >
      <header class="mb-2.5 flex flex-wrap items-center gap-2">
        <UBadge :color="entry.source === 'admin' ? 'primary' : 'neutral'" variant="soft" size="sm">
          {{ sourceLabel(entry) }}
        </UBadge>
        <span class="font-mono text-xs text-gray-500 dark:text-gray-400">{{ shortTime(entry.observedAt) }}</span>
        <!--
          管理视图里 `#<id> · 物品 <itemId>` 必须是本行**第一个**出现 `#` 的文本：
          e2e 用 `filter({ hasText: '#<id> ' })` 定位整行，并在行文本里取第一个 #(\d+) 当条目号。
          所以这行不能挪到来源/时间之后，也不能在此前插入任何带 `#` 的内容。
        -->
        <span v-if="isAdmin(entry)" class="text-xs text-gray-500 dark:text-gray-400">
          {{ t('item.contribution.entryLine', { id: entry.id, itemId: entry.itemId }) }}
          <template v-if="entry.itemName">{{ t('item.contribution.itemName', { name: entry.itemName }) }}</template>
        </span>
        <template v-if="entry.appliedFields.length > 0">
          <span class="text-xs text-gray-500 dark:text-gray-400">{{ t('item.contribution.changed') }}</span>
          <UBadge v-for="field in entry.appliedFields" :key="field" color="neutral" variant="soft" size="sm">
            <span class="font-mono">{{ field }}</span>
          </UBadge>
        </template>
        <UBadge v-else color="neutral" variant="soft" size="sm">{{ t('audit.noFieldsChanged') }}</UBadge>
        <template v-if="isAdmin(entry) && entry.blocked">
          <UBadge color="error" variant="soft" size="sm">{{ t('audit.blocked') }}</UBadge>
          <span v-if="entry.blockedReason" class="text-xs text-gray-600 dark:text-gray-300">{{ entry.blockedReason }}</span>
        </template>
        <span class="flex-1" />
        <button
          v-if="props.admin && isAdmin(entry)"
          :class="[blockButton, entry.blocked ? blockRestore : blockDanger]"
          :data-testid="entry.blocked ? 'audit-restore' : 'audit-block'"
          type="button"
          :disabled="props.busyId === entry.id"
          @click="emit('toggleBlock', entry)"
        >
          {{ props.busyId === entry.id ? t('common.processing') : entry.blocked ? t('audit.restore') : t('audit.block') }}
        </button>
      </header>
      <pre
        class="m-0 max-w-full overflow-x-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-800 dark:bg-gray-950/60 dark:text-gray-200"
      >{{ payloadText(entry) }}</pre>
    </article>
    <p v-if="props.contributions.length === 0" class="m-0 text-sm text-gray-500 dark:text-gray-400">
      {{ t('item.contribution.empty') }}
    </p>
  </div>
</template>
