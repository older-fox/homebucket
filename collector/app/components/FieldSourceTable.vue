<script setup lang="ts">
import type { FieldSource } from '../composables/useApi';

defineProps<{ fields: FieldSource[] }>();

const { t } = useI18n();

/**
 * 字段名说人话（界面不直接暴露 camelCase 的列名）。
 * 键必须是 i18n 里的键路径，而不是现成文案 —— 否则切语言时这张表会整列留在中文。
 */
const LABEL_KEYS: Record<string, string> = {
  name: 'item.field.name',
  description: 'item.field.description',
  model: 'item.field.model',
  manufacturer: 'item.field.manufacturer',
  category: 'item.field.category',
  baseUnit: 'item.field.baseUnit',
  imageUrls: 'item.field.imageUrls',
};

function label(field: string): string {
  const key = LABEL_KEYS[field];
  if (key) return t(key);
  if (field.startsWith('attributes.')) return t('item.attributeField', { name: field.slice('attributes.'.length) });
  return field;
}

function sourceName(field: FieldSource): string {
  if (field.source === 'admin') return t('errors.adminSource');
  return field.instanceName ?? (field.instanceId === null ? t('errors.sourceUnknown') : t('errors.instance', { id: field.instanceId }));
}

/** 空值统一用 common.empty（`—`）：这里必须与"值是空字符串"区分开，否则界面会出现一段空白。 */
function display(value: string | string[] | null): string {
  if (value === null || value === '') return t('common.empty');
  return Array.isArray(value) ? value.join(t('item.field.sep')) : value;
}

function shortTime(value: string | null): string {
  if (!value) return t('common.empty');
  return value.replace('T', ' ').slice(0, 19);
}

/**
 * 票数说明：`3/5 票 · 权重 2.4/4.2`。
 *
 * 只显示票数是不够的 —— 这套投票里**权重和才是排序依据**，票数只在权重打平时起作用。
 * 所以两个数都要给，否则"为什么明明 2 票却输给 1 票"在界面上无法解释。
 * 整句话由 i18n 的 voteTally 模板给出，组件只负责算四个数（文案顺序交给翻译）。
 */
function voteText(field: FieldSource): string {
  const count = field.voteCount ?? 0;
  const total = (field.tally ?? []).reduce((sum, entry) => sum + entry.count, 0);
  return t('item.field.voteTally', {
    count,
    total,
    weight: (field.voteWeight ?? 0).toFixed(2),
    totalWeight: (field.totalWeight ?? 0).toFixed(2),
  });
}

/** 未决时把并列的候选列出来：这是"随机下发"的唯一线索，不显示就等于黑箱 */
function rivalText(field: FieldSource): string {
  const others = (field.tally ?? []).filter((entry) => entry.value !== field.value);
  if (others.length === 0) return '';
  return others.map((entry) => t('item.field.valueWithCount', { value: entry.value, count: entry.count })).join(t('item.field.sep'));
}

/** 这一行的票数是否真的是最高票（对比所有候选的权重的简单判断，仅用于配色） */
function isWinner(field: FieldSource): boolean {
  const weight = field.voteWeight ?? 0;
  return (field.tally ?? []).every((entry) => entry.weight <= weight);
}

/**
 * data-testid="field-source" 必须挂在**外层滚动容器**上（不是每行）：
 * 验收脚本先按这个 testid 取到元素，再在它里面找 `tbody tr` 逐行读 <td>。
 * 挂到 <tr> 上会让 `locator('tbody tr')` 一个也找不到。
 */
const wrapper = 'w-full max-w-full overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900';
const tableHead = 'whitespace-nowrap border-b border-gray-200 bg-gray-50 px-3 py-2.5 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-400';
const tableCell = 'border-b border-gray-200 px-3 py-2.5 align-top text-sm dark:border-gray-800';
</script>

<template>
  <div data-testid="field-source" :class="wrapper">
    <table class="w-full border-collapse">
      <thead>
        <tr>
          <th :class="tableHead">{{ t('sources.columnField') }}</th>
          <th :class="tableHead">{{ t('item.field.currentValue') }}</th>
          <th :class="tableHead">{{ t('audit.filterSource') }}</th>
          <th :class="tableHead">{{ t('item.field.observedAt') }}</th>
          <th :class="[tableHead, 'text-right']">{{ t('item.field.agreedCount') }}</th>
          <th :class="tableHead">{{ t('item.field.vote') }}</th>
          <th :class="tableHead">{{ t('common.status') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="field in fields" :key="field.field">
          <td :class="[tableCell, 'whitespace-nowrap font-medium']">{{ label(field.field) }}</td>
          <td :class="[tableCell, 'max-w-[420px] break-words max-sm:max-w-none']">{{ display(field.value) }}</td>
          <td :class="[tableCell, 'whitespace-nowrap']">
            <UBadge v-if="field.source === 'admin'" color="primary" variant="soft" size="sm">
              {{ t('errors.adminSource') }}
            </UBadge>
            <span v-else class="text-gray-700 dark:text-gray-300">{{ sourceName(field) }}</span>
          </td>
          <td :class="[tableCell, 'whitespace-nowrap font-mono text-xs text-gray-500 dark:text-gray-400']">{{ shortTime(field.observedAt) }}</td>
          <td :class="[tableCell, 'text-right tabular']">{{ field.agreedBy }}</td>
          <td :class="[tableCell, 'min-w-[190px]']">
            <!-- 图片与锁定字段刻意不投票（图片是累加集合、锁定以人工意志为准），显示"不投票" -->
            <template v-if="!field.voted">
              <span class="text-xs text-gray-500 dark:text-gray-400">{{ t('item.field.notVoted') }}</span>
            </template>
            <template v-else>
              <div class="flex flex-wrap items-center gap-1.5">
                <UBadge :color="isWinner(field) ? 'success' : 'primary'" variant="soft" size="sm">
                  {{ voteText(field) }}
                </UBadge>
                <span v-if="field.decided" class="text-xs text-gray-500 dark:text-gray-400">{{ t('item.field.highestVote') }}</span>
                <UBadge v-else color="warning" variant="soft" size="sm">{{ t('item.field.tied') }}</UBadge>
              </div>
              <div v-if="!field.decided && rivalText(field)" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{ t('item.field.otherRivals', { text: rivalText(field) }) }}
              </div>
            </template>
          </td>
          <td :class="[tableCell, 'whitespace-nowrap']">
            <UBadge v-if="field.locked" color="warning" variant="soft" size="sm">{{ t('item.field.locked') }}</UBadge>
            <span v-else class="text-xs text-gray-500 dark:text-gray-400">{{ t('item.field.automatic') }}</span>
          </td>
        </tr>
        <tr v-if="fields.length === 0">
          <td :class="[tableCell, 'text-center text-gray-500 dark:text-gray-400']" colspan="7">
            {{ t('item.field.noneReported') }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
