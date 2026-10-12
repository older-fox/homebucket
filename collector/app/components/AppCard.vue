<script setup lang="ts">
/**
 * 规范卡片（Design.md §6.3）。
 *
 * 为什么不用 Nuxt UI 的 `<UCard>` 包一层：`hb-card` 那套观感（rounded-2xl + 淡 ring
 * 而非 border + 半透明底 + 轻阴影）与 UCard 默认主题是两套写法，靠 `:ui` 覆盖会变成
 * 全局 tw-merge 的博弈，换不来任何语义收益。卡片只是版面结构，这里用最朴素的元素
 * 把标记固定下来，保证每个页面长得一样。
 *
 * 结构：可选标题(16/600) + 副标题(12/灰) + 内容；`#actions` 是右上角操作区。
 * 根元素可通过 `as` 指定（默认 `<section>`），attrs（含 data-testid）落在根上。
 */
withDefaults(
  defineProps<{
    title?: string;
    subtitle?: string;
    /** 根元素标签，例如表单卡片用 as="form" */
    as?: string;
    /** 是否给内容区加 p-6；Hero 型卡片可关掉自管内边距 */
    padded?: boolean;
  }>(),
  { as: 'section', padded: true },
);
</script>

<template>
  <component :is="as" class="hb-card">
    <div
      v-if="title || subtitle || $slots.actions"
      class="flex items-start justify-between gap-4 border-b border-gray-200/80 px-6 py-4 dark:border-gray-800"
    >
      <div class="min-w-0">
        <h3 v-if="title" class="m-0 truncate text-base font-semibold text-gray-900 dark:text-white">
          {{ title }}
        </h3>
        <p v-if="subtitle" class="mt-0.5 mb-0 text-xs leading-5 text-gray-500 dark:text-gray-400">
          {{ subtitle }}
        </p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
    <div :class="padded ? 'p-6' : ''">
      <slot />
    </div>
  </component>
</template>
