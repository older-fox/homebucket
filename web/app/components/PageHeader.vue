<template>
  <header class="page-header hb-rise">
    <div class="titles">
      <!-- 移动端三级页面：返回上一级（桌面端有侧边栏，不显示） -->
      <NuxtLink v-if="back" :to="back" class="back hb-tap">
        <UIcon name="i-lucide-arrow-left" />
        <span>{{ backLabel ?? t('common.back') }}</span>
      </NuxtLink>

      <h1>{{ title }}</h1>
      <p v-if="description" class="hb-muted desc">{{ description }}</p>
    </div>
    <div class="actions hb-tap">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    description?: string;
    /** 传了就在移动端显示返回按钮（值为返回目标路径） */
    back?: string;
    backLabel?: string;
  }>(),
  { description: undefined, back: undefined, backLabel: undefined },
);

const { t } = useI18n();
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.titles {
  min-width: 0;
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0 0 6px -2px;
  padding: 4px 8px 4px 4px;
  border-radius: var(--hb-r-sm);
  color: var(--hb-brand);
  font-size: var(--hb-fs-sm);
  font-weight: var(--hb-fw-semibold);
  text-decoration: none;
}

.back:hover {
  background: var(--hb-brand-soft);
}

.back :deep(svg) {
  width: 17px;
  height: 17px;
}

h1 {
  margin: 0;
  font-size: var(--hb-fs-display);
  font-weight: var(--hb-fw-bold);
  letter-spacing: var(--hb-ls-display);
  line-height: var(--hb-lh-display);
}

.desc {
  margin: 6px 0 0;
  font-size: var(--hb-fs-sm);
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* 桌面端有侧边栏，不需要返回按钮 */
@media (min-width: 768px) {
  .back {
    display: none;
  }
}
</style>
