<script setup lang="ts">
import type { FieldSource } from '../api';

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
</script>

<template>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>字段</th>
          <th>当前值</th>
          <th>来源</th>
          <th>观测时间</th>
          <th class="num">同值上报</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="field in fields" :key="field.field">
          <td class="nowrap">{{ label(field.field) }}</td>
          <td class="field-value">{{ display(field.value) }}</td>
          <td class="nowrap">
            <span v-if="field.source === 'admin'" class="chip accent">人工纠错</span>
            <span v-else>{{ sourceName(field) }}</span>
          </td>
          <td class="nowrap mono tiny">{{ shortTime(field.observedAt) }}</td>
          <td class="num">{{ field.agreedBy }}</td>
          <td class="nowrap">
            <span v-if="field.locked" class="chip warn">已锁定</span>
            <span v-else class="muted tiny">自动</span>
          </td>
        </tr>
        <tr v-if="fields.length === 0">
          <td colspan="6" class="muted center">还没有任何字段被上报过</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
