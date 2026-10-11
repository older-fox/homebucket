<script setup lang="ts">
import type { FieldSource } from '../composables/useApi';

defineProps<{ fields: FieldSource[] }>();

/** 字段名说人话（界面不直接暴露 camelCase 的列名） */
const LABELS: Record<string, string> = {
  name: '名称',
  description: '描述',
  model: '型号',
  manufacturer: '厂商',
  category: '分类',
  baseUnit: '基础单位',
  imageUrls: '图片',
};

function label(field: string): string {
  if (LABELS[field]) return LABELS[field];
  if (field.startsWith('attributes.')) return `扩展属性 · ${field.slice('attributes.'.length)}`;
  return field;
}

function sourceName(field: FieldSource): string {
  if (field.source === 'admin') return '人工纠错';
  return field.instanceName ?? (field.instanceId === null ? '未知来源' : `实例 #${field.instanceId}`);
}

function display(value: string | string[] | null): string {
  if (value === null || value === '') return '—';
  return Array.isArray(value) ? value.join('、') : value;
}

function shortTime(value: string | null): string {
  if (!value) return '—';
  return value.replace('T', ' ').slice(0, 19);
}

const tableHead =
  'whitespace-nowrap bg-slate-100 px-3 py-2 text-left text-[13.5px] font-semibold text-slate-600 dark:bg-slate-800/70 dark:text-slate-300';
const tableCell = 'border-b border-slate-200 px-3 py-2 align-top text-[13.5px] dark:border-slate-800';
const chipAccent =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-brand-500/30 bg-brand-50 px-2.5 py-0.5 text-xs text-brand-700 dark:bg-brand-700/20 dark:text-brand-100';
const chipWarn =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-500/30 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-700 dark:bg-amber-500/15 dark:text-amber-300';
</script>

<template>
  <div
    data-testid="field-source"
    class="w-full max-w-full overflow-x-auto rounded-[10px] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
  >
    <table class="w-full border-collapse text-[13.5px]">
      <thead>
        <tr>
          <th :class="tableHead">字段</th>
          <th :class="tableHead">当前值</th>
          <th :class="tableHead">来源</th>
          <th :class="tableHead">观测时间</th>
          <th :class="[tableHead, 'text-right']">同值上报</th>
          <th :class="tableHead">状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="field in fields" :key="field.field">
          <td :class="[tableCell, 'whitespace-nowrap']">{{ label(field.field) }}</td>
          <td :class="[tableCell, 'max-w-[420px] break-words max-sm:max-w-none']">{{ display(field.value) }}</td>
          <td :class="[tableCell, 'whitespace-nowrap']">
            <span v-if="field.source === 'admin'" :class="chipAccent">人工纠错</span>
            <span v-else>{{ sourceName(field) }}</span>
          </td>
          <td :class="[tableCell, 'whitespace-nowrap font-mono text-xs']">{{ shortTime(field.observedAt) }}</td>
          <td :class="[tableCell, 'text-right tabular-nums']">{{ field.agreedBy }}</td>
          <td :class="[tableCell, 'whitespace-nowrap']">
            <span v-if="field.locked" :class="chipWarn">已锁定</span>
            <span v-else class="text-xs text-slate-500 dark:text-slate-400">自动</span>
          </td>
        </tr>
        <tr v-if="fields.length === 0">
          <td :class="[tableCell, 'text-center text-slate-500 dark:text-slate-400']" colspan="6">
            还没有任何字段被上报过
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
