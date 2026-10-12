<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ page: number; pageSize: number; total: number }>();
const emit = defineEmits<{ (e: 'update:page', page: number): void }>();

const { t } = useI18n();

const lastPage = computed(() => Math.max(1, Math.ceil(props.total / Math.max(1, props.pageSize))));

/**
 * 翻页按钮用 Nuxt UI 的 UButton 而不是自己拼 class：
 * 焦点环、禁用态、明暗两套配色都由组件统一给，页面里就不必再抄一遍（规范 6.1 只要求次按钮用
 * variant="outline" color="neutral"，没要求自己写描边）。
 */
const buttonColor = 'neutral' as const;
</script>

<template>
  <div
    v-if="total > 0"
    data-testid="pager"
    class="mt-4 flex flex-wrap items-center justify-center gap-2.5 text-sm text-gray-500 dark:text-gray-400"
  >
    <!--
      图标一律用本站的 <AppIcon>（内联 SVG）：
      Nuxt UI 的 `icon="i-lucide-…"` 会在客户端去拉 `/api/_nuxt_icon/lucide.json`
      图标集合 —— 既是运行时图标集（设计规范 §8 明确禁止、离线会挂），
      也会在页面切换时留下一堆被中断的请求。见 AppIcon.vue 顶部说明。
    -->
    <UButton
      :color="buttonColor"
      variant="outline"
      size="sm"
      :disabled="page <= 1"
      @click="emit('update:page', page - 1)"
    >
      <AppIcon name="chevronLeft" class="h-4 w-4" />
      {{ t('pager.previous') }}
    </UButton>
    <!-- 页码统计是数字，必须等宽，否则翻页时整行会左右抖 -->
    <span class="tabular">{{ t('pager.summary', { page, pages: lastPage, total }) }}</span>
    <UButton
      :color="buttonColor"
      variant="outline"
      size="sm"
      :disabled="page >= lastPage"
      @click="emit('update:page', page + 1)"
    >
      {{ t('pager.next') }}
      <AppIcon name="chevronRight" class="h-4 w-4" />
    </UButton>
  </div>
</template>
