<template>
  <form class="search hb-card" @submit.prevent="emit('submit')">
    <UIcon name="i-lucide-search" class="search-icon" />
    <input
      v-model="value"
      class="search-input"
      type="search"
      enterkeyhint="search"
      :placeholder="placeholder"
    />
    <UButton type="submit" size="sm" class="hb-tap search-btn">{{ t('common.search') }}</UButton>
  </form>
</template>

<script setup lang="ts">
/**
 * 通用搜索框（主页 / 物品页共用同一份样式与交互）。
 * - v-model:modelValue 双向绑定关键字
 * - @submit 由调用方决定行为（主页跳搜索页、物品页原地筛选）
 */
const props = defineProps<{
  modelValue: string;
  placeholder: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [string];
  submit: [];
}>();

const value = computed({
  get: () => props.modelValue,
  set: (next: string) => emit('update:modelValue', next),
});

const { t } = useI18n();
</script>

<style scoped>
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 14px;
  margin-bottom: 20px;
}

.search-icon {
  width: 18px;
  height: 18px;
  color: var(--hb-muted);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 38px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--hb-r-full);
  background: var(--hb-surface-2);
  color: var(--hb-text);
  font-size: var(--hb-fs-body);
  outline: none;
}

.search-input::placeholder {
  color: var(--hb-muted);
}

/* 移动端：占满一行、高度足够、16px 避免 iOS 聚焦缩放 */
@media (max-width: 640px) {
  .search {
    padding: 5px;
    gap: 0;
  }

  .search-icon {
    margin: 0 4px 0 10px;
  }

  .search-input {
    height: 46px;
    font-size: 16px;
    padding: 0 14px;
  }

  .search-btn {
    display: none;
  }
}
</style>
