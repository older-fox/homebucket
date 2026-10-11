<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ page: number; pageSize: number; total: number }>();
const emit = defineEmits<{ (e: 'update:page', page: number): void }>();

const lastPage = computed(() => Math.max(1, Math.ceil(props.total / Math.max(1, props.pageSize))));
</script>

<template>
  <div v-if="total > 0" class="pager">
    <button class="btn ghost tiny" type="button" :disabled="page <= 1" @click="emit('update:page', page - 1)">
      上一页
    </button>
    <span>第 {{ page }} / {{ lastPage }} 页 · 共 {{ total }} 条</span>
    <button class="btn ghost tiny" type="button" :disabled="page >= lastPage" @click="emit('update:page', page + 1)">
      下一页
    </button>
  </div>
</template>
