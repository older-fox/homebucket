<script setup lang="ts">
/**
 * 应用根：只做两件事 —— 提供 Nuxt UI 的宿主 `<UApp>`（弹窗、toast 等组件的挂载点与全局配置），
 * 以及接管全局 head。
 *
 * head 为什么从 nuxt.config 搬到这里：标题与描述是要翻译的文案，而 nuxt.config 在构建期
 * 拿不到 i18n；把硬编码中文留在那儿，英文界面下浏览器标签和 SEO 描述会一直是中文。
 * 各页面自己用 `useHead({ title })` 覆盖标题，这里只提供标题模板与兜底。
 */
const { t } = useI18n();

useHead({
  title: computed(() => t('meta.title')),
  titleTemplate: (title?: string) =>
    title ? t('meta.titleTemplate', { title }) : t('meta.title'),
  meta: [{ name: 'description', content: computed(() => t('meta.description')) }],
});
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <AppConfirmDialog />
  </UApp>
</template>
