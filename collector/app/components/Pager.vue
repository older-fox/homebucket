<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ page: number; pageSize: number; total: number }>();
const emit = defineEmits<{ (e: 'update:page', page: number): void }>();

const lastPage = computed(() => Math.max(1, Math.ceil(props.total / Math.max(1, props.pageSize))));

const ghostButton =
  'inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[12.5px] font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800';
</script>

<template>
  <div
    v-if="total > 0"
    data-testid="pager"
    class="mt-4 flex flex-wrap items-center justify-center gap-2.5 text-[13px] text-slate-500 dark:text-slate-400"
  >
    <button :class="ghostButton" type="button" :disabled="page <= 1" @click="emit('update:page', page - 1)">
      上一页
    </button>
    <span>第 {{ page }} / {{ lastPage }} 页 · 共 {{ total }} 条</span>
    <button :class="ghostButton" type="button" :disabled="page >= lastPage" @click="emit('update:page', page + 1)">
      下一页
    </button>
  </div>
</template>
