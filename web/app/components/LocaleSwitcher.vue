<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <button type="button" class="icon-btn hb-tap" :aria-label="t('nav.language')">
      <UIcon name="i-lucide-languages" />
    </button>
  </UDropdownMenu>
</template>

<script setup lang="ts">
const { locale, locales, t, setLocale } = useI18n();

const items = computed(() => [
  locales.value.map((item) => {
    const code = typeof item === 'string' ? item : item.code;
    const name = typeof item === 'string' ? item : (item.name ?? item.code);
    return {
      label: `${code === locale.value ? '● ' : '○ '}${name}`,
      // 必须用 setLocale：@nuxtjs/i18n 默认懒加载语言包，直接写 locale.value 只会改标记，
      // 不会把目标语言的 messages 拉下来，页面于是显示原始 key（dev 下还会刷一堆
      // `[intlify] Not found 'auth.login' key in 'zh' locale messages.`）。
      onSelect: () => {
        void setLocale(code);
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
