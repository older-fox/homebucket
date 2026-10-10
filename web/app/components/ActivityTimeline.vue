<template>
  <ul class="tl">
    <li
      v-for="entry in entries"
      :key="entry.id"
      class="tl-item hb-rise"
      :class="{ clickable: !!entry.itemId }"
      @click="select(entry)"
    >
      <span class="tl-icon" :class="{ muted: isDeleted(entry.action) }">
        <UIcon :name="iconOf(entry.action)" />
      </span>

      <div class="tl-body">
        <div class="tl-head">
          <span class="tl-action">{{ actionLabel(entry.action) }}</span>
          <span v-if="entry.itemName" class="tl-target hb-truncate">{{ entry.itemName }}</span>
          <span v-if="isDeleted(entry.action)" class="hb-chip tiny danger">{{ t('history.deleted') }}</span>
        </div>

        <div class="tl-meta">
          <span>{{ t('history.by', { name: entry.actorName }) }}</span>
          <span class="hb-muted" :title="dateTime(entry.createdAt)">{{ relative(entry.createdAt) }}</span>
        </div>

        <ul v-if="entry.changes.length" class="tl-changes">
          <li v-for="(change, index) in entry.changes" :key="index" class="tl-change">
            <span class="tl-field">{{ fieldLabel(change.field) }}</span>
            <span class="tl-diff">{{ diffText(change) }}</span>
          </li>
        </ul>
      </div>

      <UIcon v-if="entry.itemId" name="i-lucide-chevron-right" class="tl-arrow" />
    </li>
  </ul>
</template>

<script setup lang="ts">
import type { ActivityChange, ActivityEntry } from '~/types/activity';

defineProps<{ entries: ActivityEntry[] }>();
const emit = defineEmits<{ select: [ActivityEntry] }>();

const { t, te } = useI18n();
const { relative, dateTime, number } = useFormat();

/** 事件名 → 图标；未知事件回退到一个通用历史图标 */
const ICONS: Record<string, string> = {
  'item.create': 'i-lucide-package-plus',
  'item.update': 'i-lucide-pencil',
  'item.delete': 'i-lucide-trash-2',
  'item.take_out': 'i-lucide-hand',
  'item.put_back': 'i-lucide-undo-2',
  'item.consume': 'i-lucide-package-minus',
  'item.restock': 'i-lucide-archive-restore',
  'item.unpack': 'i-lucide-package-open',
  'unit.create': 'i-lucide-barcode',
  'unit.update': 'i-lucide-barcode',
  'unit.delete': 'i-lucide-barcode',
  'location.create': 'i-lucide-folder-plus',
  'location.update': 'i-lucide-folder-pen',
  'location.move': 'i-lucide-folder-symlink',
  'location.delete': 'i-lucide-folder-x',
};

const iconOf = (action: string) => ICONS[action] ?? 'i-lucide-history';
const isDeleted = (action: string) => action.endsWith('.delete');

/** 事件名里的点换成下划线才能作为 i18n key（点会被当成嵌套路径） */
function actionLabel(action: string): string {
  const key = `history.action.${action.replace(/\W/g, '_')}`;
  return te(key) ? t(key) : action;
}

function fieldLabel(field: string): string {
  const key = `history.field.${field}`;
  return te(key) ? t(key) : field;
}

function fmt(value: unknown): string {
  if (value === null || value === undefined) return t('history.emptyValue');
  if (typeof value === 'boolean') return value ? t('history.yes') : t('history.no');
  if (Array.isArray(value)) return value.length ? value.map(String).join(t('common.listSeparator')) : t('history.emptyValue');
  if (typeof value === 'number') return number(value);
  return String(value);
}

/** 数组（标签）：只展示增删，形如 "+工具 −易碎"；其余字段展示 旧 → 新 */
function diffText(change: ActivityChange): string {
  if (Array.isArray(change.from) && Array.isArray(change.to)) {
    const from = (change.from as unknown[]).map(String);
    const to = (change.to as unknown[]).map(String);
    const added = to.filter((item) => !from.includes(item));
    const removed = from.filter((item) => !to.includes(item));
    const parts: string[] = [];
    if (added.length) parts.push(`+${added.join(t('common.listSeparator'))}`);
    if (removed.length) parts.push(`−${removed.join(t('common.listSeparator'))}`);
    return parts.length ? parts.join(' ') : t('history.emptyValue');
  }
  return `${fmt(change.from)} → ${fmt(change.to)}`;
}

function select(entry: ActivityEntry) {
  if (entry.itemId) emit('select', entry);
}
</script>

<style scoped>
.tl {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tl-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--hb-border);
  border-radius: var(--hb-r-lg);
  background: var(--hb-surface);
}

.tl-item.clickable {
  cursor: pointer;
  transition:
    background var(--hb-dur) var(--hb-ease),
    border-color var(--hb-dur) var(--hb-ease);
}

.tl-item.clickable:hover {
  background: var(--hb-surface-2);
  border-color: var(--hb-border-strong);
}

.tl-icon {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--hb-r-sm);
  background: var(--hb-brand-soft);
  color: var(--hb-brand);
}

.tl-icon.muted {
  background: color-mix(in srgb, var(--hb-danger) 12%, transparent);
  color: var(--hb-danger);
}

.tl-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.tl-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tl-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.tl-action {
  font-weight: var(--hb-fw-semibold);
}

.tl-target {
  max-width: 100%;
  font-size: var(--hb-fs-sm);
  color: var(--hb-text-2);
}

.tl-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--hb-fs-xs);
  color: var(--hb-muted);
}

.tl-changes {
  list-style: none;
  margin: 2px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tl-change {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: var(--hb-fs-sm);
}

.tl-field {
  flex: 0 0 auto;
  color: var(--hb-muted);
}

.tl-diff {
  min-width: 0;
  color: var(--hb-text);
  overflow-wrap: anywhere;
}

.tl-arrow {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  align-self: center;
  color: var(--hb-muted);
}

.hb-chip.danger {
  border-color: transparent;
  background: color-mix(in srgb, var(--hb-danger) 12%, transparent);
  color: var(--hb-danger);
}
</style>
