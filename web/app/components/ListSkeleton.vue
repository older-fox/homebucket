<template>
  <div class="hb-skeleton-list" :class="{ card }" :style="style">
    <div v-for="n in rows" :key="n" class="hb-skeleton hb-skeleton-line" />
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    rows?: number;
    /** 自带背景框（用于放在页面里、不在卡片内的场景） */
    card?: boolean;
    lineHeight?: number;
  }>(),
  { rows: 5, card: false, lineHeight: 44 },
);

const style = computed(() => ({ '--hb-skeleton-line': `${props.lineHeight}px` }));
</script>
