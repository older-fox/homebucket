<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup lang="ts">
const { locale } = useI18n();

// html lang 跟随语言：中文走更宽松的行高与字距（见 main.css 的 :lang(zh) 规则）
useHead({
  htmlAttrs: {
    lang: computed(() => locale.value),
  },
});
</script>
