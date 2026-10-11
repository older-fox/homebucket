<template>
  <span v-if="lostAt" class="hb-chip tiny lost" :title="title">
    <UIcon name="i-lucide-search-x" class="lost-icon" />
    {{ t('item.lost') }}
  </span>
</template>

<script setup lang="ts">
/**
 * 「已遗失」状态胶囊：物品列表、物品详情、序列号件共用。
 *
 * 遗失（lostAt）与取走（takenOutAt）是两件独立的事，所以是两个组件：
 *   - 取走：东西在别人手里，但还属于这个家，等着还回来 → TakenOutChip（警告色）
 *   - 遗失：确认找不回来了 → 这里（红色），并且不再进「取走过久」提醒
 * 调用方只管传时间，没标遗失时组件自身不渲染。
 */
const props = defineProps<{
  /** 标记遗失的时间（ISO 字符串），非空 = 已遗失 */
  lostAt?: string | null;
}>();

const { t } = useI18n();
const { relative } = useFormat();

const title = computed(() => t('item.lostAgo', { time: relative(props.lostAt ?? '') }));
</script>

<style scoped>
.lost-icon {
  width: 11px;
  height: 11px;
}
</style>
