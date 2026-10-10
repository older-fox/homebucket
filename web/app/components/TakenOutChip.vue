<template>
  <span v-if="text" class="hb-chip tiny out" :title="title">
    <UIcon name="i-lucide-hand" class="out-icon" />
    {{ text }}
  </span>
</template>

<script setup lang="ts">
/**
 * 「已取走」状态胶囊：库存列表、物品详情、搜索结果、位置详情共用。
 *
 * 取走状态有两种跟踪方式，所以调用方按情况传参：
 *   - 没有 SN 的物品按整件追踪 → 传 takenOutAt（非空即已拿走）
 *   - 有 SN 的物品按件追踪     → 传 count（正被拿走的件数），item.takenOutAt 恒为空
 * 两个都为空时什么都不渲染，调用方不用自己写 v-if。
 *
 * 顺手把"多久之前拿走的"放进 title：列表里不必为时间撑长一列，鼠标悬停即可看到。
 */
const props = defineProps<{
  /** 整件追踪：取走时间（ISO 字符串），非空 = 整件已拿走 */
  takenOutAt?: string | null;
  /** 按件追踪：正被拿走的件数 */
  count?: number;
}>();

const { t } = useI18n();
const { relative } = useFormat();

const text = computed(() => {
  if (props.takenOutAt) return t('item.takenOut');
  if (props.count && props.count > 0) return t('item.takenOutUnits', { count: props.count });
  return '';
});

const title = computed(() =>
  props.takenOutAt ? t('scan.takenOutAgo', { time: relative(props.takenOutAt) }) : text.value,
);
</script>

<style scoped>
.out-icon {
  width: 11px;
  height: 11px;
}
</style>
