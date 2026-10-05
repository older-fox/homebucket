<template>
  <div class="empty hb-rise">
    <span class="circle">
      <UIcon :name="icon" class="icon" />
    </span>
    <p class="text">{{ text }}</p>
    <div v-if="$slots.default" class="action">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ text: string; icon?: string }>(), { icon: 'i-lucide-package-open' });
</script>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 44px 20px;
  text-align: center;
  background: var(--hb-surface);
  border: 1px dashed var(--hb-border-strong);
  border-radius: var(--hb-r-lg);
}

.circle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: var(--hb-brand-soft);
  color: var(--hb-brand);
}

.icon {
  width: 26px;
  height: 26px;
}

.text {
  margin: 0;
  max-width: 32ch;
  font-size: var(--hb-fs-sm);
  line-height: var(--hb-lh-cjk);
  color: var(--hb-muted);
}

.action {
  margin-top: 2px;
}
</style>
