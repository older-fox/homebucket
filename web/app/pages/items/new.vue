<template>
  <div>
    <PageHeader :title="templateId ? t('template.useTemplate') : t('item.new')" />
    <ItemForm :template-id="templateId" />
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
const route = useRoute();
const templateId = computed(() => (route.query.templateId ? Number(route.query.templateId) : undefined));
</script>
