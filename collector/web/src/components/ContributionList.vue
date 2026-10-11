<script setup lang="ts">
import type { AdminContribution, ContributionView } from '../api';

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
    Object.entries(entry.payload).filter(([, value]) => value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)),
  );
  return Object.keys(only).length > 0 ? JSON.stringify(only, null, 2) : '{}（这次没有新内容）';
}
</script>

<template>
  <div class="log">
    <article
      v-for="entry in props.contributions"
      :key="entry.id"
      class="log-entry"
      :class="{ blocked: isAdmin(entry) && entry.blocked }"
    >
      <header class="log-head">
        <span class="chip" :class="entry.source === 'admin' ? 'accent' : ''">{{ sourceLabel(entry) }}</span>
        <span class="mono tiny">{{ shortTime(entry.observedAt) }}</span>
        <span v-if="isAdmin(entry)" class="tiny muted">
          #{{ entry.id }} · 物品 {{ entry.itemId }}
          <template v-if="entry.itemName">（{{ entry.itemName }}）</template>
        </span>
        <template v-if="entry.appliedFields.length > 0">
          <span class="tiny muted">改动了</span>
          <span v-for="field in entry.appliedFields" :key="field" class="chip mono tiny">{{ field }}</span>
        </template>
        <span v-else class="chip tiny">没有改动有效字段</span>
        <template v-if="isAdmin(entry) && entry.blocked">
          <span class="chip danger">已屏蔽</span>
          <span v-if="entry.blockedReason" class="tiny">{{ entry.blockedReason }}</span>
        </template>
        <span class="spacer" />
        <button
          v-if="props.admin && isAdmin(entry)"
          class="btn tiny"
          :class="entry.blocked ? 'subtle' : 'danger'"
          type="button"
          :disabled="props.busyId === entry.id"
          @click="emit('toggleBlock', entry)"
        >
          {{ props.busyId === entry.id ? '处理中…' : entry.blocked ? '恢复这条' : '屏蔽这条' }}
        </button>
      </header>
      <pre class="log-payload">{{ payloadText(entry) }}</pre>
    </article>
    <p v-if="props.contributions.length === 0" class="muted small">还没有上报记录。</p>
  </div>
</template>
