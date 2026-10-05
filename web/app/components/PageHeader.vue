<template>
  <header class="page-header hb-rise">
    <div class="titles">
      <h1>{{ title }}</h1>
      <p v-if="description" class="hb-muted desc">{{ description }}</p>
    </div>
    <div class="actions hb-tap">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
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

@media (min-width: 768px) {
  h1 {
    font-size: var(--hb-fs-display);
  }
}
</style>
