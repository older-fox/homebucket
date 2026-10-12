<script setup lang="ts">
/**
 * 空状态（Design.md §6.9）：居中纵向堆叠 —— 48px 圆形浅蓝图标容器 → 灰字说明 → 可选次级操作。
 */
import type { IconName } from './AppIcon.vue';

withDefaults(defineProps<{ icon?: IconName }>(), { icon: 'box' });
</script>

<template>
  <div class="flex flex-col items-center gap-3 py-10 text-center">
    <span
      class="grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300"
    >
      <AppIcon :name="icon" class="h-6 w-6" />
    </span>
    <p class="m-0 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">
      <slot />
    </p>
    <div v-if="$slots.actions" class="mt-1 flex items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
