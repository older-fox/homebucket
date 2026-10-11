<script setup lang="ts">
import type { AdminContribution, ContributionView } from '../composables/useApi';

const props = defineProps<{
  contributions: Array<ContributionView | AdminContribution>;
  admin?: boolean;
  busyId?: number | null;
}>();

const emit = defineEmits<{ (e: 'toggleBlock', entry: AdminContribution): void }>();

function isAdmin(entry: ContributionView | AdminContribution): entry is AdminContribution {
  return 'blocked' in entry;
}

function sourceLabel(entry: ContributionView): string {
  if (entry.source === 'admin') return '人工纠错';
  return entry.instanceName ?? (entry.instanceId === null ? '未知来源' : `实例 #${entry.instanceId}`);
}

function shortTime(value: string): string {
  return value.replace('T', ' ').slice(0, 19);
}

function payloadText(entry: ContributionView): string {
  const only = Object.fromEntries(
    Object.entries(entry.payload).filter(
      ([, value]) => value !== null && value !== '' && !(Array.isArray(value) && value.length === 0),
    ),
  );
  return Object.keys(only).length > 0 ? JSON.stringify(only, null, 2) : '{}（这次没有新内容）';
}

const chip = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
const chipAccent = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-brand-500/30 bg-brand-50 px-2.5 py-0.5 text-xs text-brand-700 dark:bg-brand-700/20 dark:text-brand-100';
const chipDanger = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-red-500/30 bg-red-50 px-2.5 py-0.5 text-xs text-red-700 dark:bg-red-500/15 dark:text-red-300';
const chipMono = 'font-mono';
const tinyButton = 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
const subtleButton = 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700';
const dangerButton = 'bg-red-600 text-white hover:bg-red-700';
</script>

<template>
  <div class="grid gap-2.5">
    <article
      v-for="entry in props.contributions"
      :key="entry.id"
      data-testid="contribution"
      class="rounded-[10px] border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
      :class="{ 'border-red-500/35 bg-red-50 dark:bg-red-500/10': isAdmin(entry) && entry.blocked }"
    >
      <header class="mb-2 flex flex-wrap items-center gap-2">
        <span :class="[chip, entry.source === 'admin' ? chipAccent : '']">{{ sourceLabel(entry) }}</span>
        <span class="font-mono text-xs text-slate-500 dark:text-slate-400">{{ shortTime(entry.observedAt) }}</span>
        <span v-if="isAdmin(entry)" class="text-xs text-slate-500 dark:text-slate-400">
          #{{ entry.id }} · 物品 {{ entry.itemId }}
          <template v-if="entry.itemName">（{{ entry.itemName }}）</template>
        </span>
        <template v-if="entry.appliedFields.length > 0">
          <span class="text-xs text-slate-500 dark:text-slate-400">改动了</span>
          <span v-for="field in entry.appliedFields" :key="field" :class="[chip, chipMono, 'text-xs']">{{ field }}</span>
        </template>
        <span v-else :class="[chip, 'text-xs']">没有改动有效字段</span>
        <template v-if="isAdmin(entry) && entry.blocked">
          <span :class="chipDanger">已屏蔽</span>
          <span v-if="entry.blockedReason" class="text-xs text-slate-600 dark:text-slate-300">{{ entry.blockedReason }}</span>
        </template>
        <span class="flex-1" />
        <button
          v-if="props.admin && isAdmin(entry)"
          :class="[tinyButton, entry.blocked ? subtleButton : dangerButton]"
          :data-testid="entry.blocked ? 'audit-restore' : 'audit-block'"
          type="button"
          :disabled="props.busyId === entry.id"
          @click="emit('toggleBlock', entry)"
        >
          {{ props.busyId === entry.id ? '处理中…' : entry.blocked ? '恢复这条' : '屏蔽这条' }}
        </button>
      </header>
      <pre
        class="m-0 max-w-full overflow-x-auto rounded-lg bg-slate-100 p-2.5 text-[12.5px] text-slate-800 dark:bg-slate-800/70 dark:text-slate-200"
      >{{ payloadText(entry) }}</pre>
    </article>
    <p v-if="props.contributions.length === 0" class="text-[13px] text-slate-500 dark:text-slate-400">
      还没有上报记录。
    </p>
  </div>
</template>
