<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <button type="button" class="icon-btn hb-tap" :aria-label="t('nav.language')">
      <UIcon name="i-lucide-languages" />
    </button>
  </UDropdownMenu>
</template>

<script setup lang="ts">
const { locale, locales, t } = useI18n();

const items = computed(() => [
  locales.value.map((item) => {
    const code = typeof item === 'string' ? item : item.code;
    const name = typeof item === 'string' ? item : (item.name ?? item.code);
    return {
      label: `${code === locale.value ? '● ' : '○ '}${name}`,
      onSelect: () => {
        locale.value = code;
      },
    };
  }),
]);
</script>

<style scoped>
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: var(--hb-r-full);
  background: transparent;
  color: var(--hb-text-2);
  cursor: pointer;
  transition: background var(--hb-dur) var(--hb-ease);
}

.icon-btn:hover {
  background: var(--hb-surface-2);
  color: var(--hb-text);
}

.icon-btn :deep(svg) {
  width: 19px;
  height: 19px;
}
</style>
