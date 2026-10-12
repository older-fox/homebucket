<script setup lang="ts">
/**
 * 提示条（Design.md §6.5）。
 *
 * 规范只给三种语义：错误（红）、成功（绿）、中性（灰）。颜色一并给出深色变体；
 * 图标是内联 SVG（AppIcon），不用任何运行时图标集。
 */
import type { IconName } from './AppIcon.vue';

const TONES = {
  error: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400',
  success: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
  neutral: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
} as const;

const ICONS: Record<keyof typeof TONES, IconName> = {
  error: 'alert',
  success: 'check',
  neutral: 'info',
};

const props = withDefaults(
  defineProps<{
    tone?: keyof typeof TONES;
    /** 覆盖默认图标 */
    icon?: IconName;
  }>(),
  { tone: 'neutral' },
);

const icon = computed<IconName>(() => props.icon ?? ICONS[props.tone]);
</script>

<template>
  <p :class="['m-0 flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-sm leading-6', TONES[tone]]">
    <AppIcon :name="icon" class="mt-1 h-4 w-4 shrink-0" />
    <span class="min-w-0"><slot /></span>
  </p>
</template>
