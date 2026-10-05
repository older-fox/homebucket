<template>
  <div class="resolving">
    <AppLogo :size="40" />
    <p>{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false });

const { t } = useI18n();
const api = useApi();
const route = useRoute();

const message = ref(t('common.loading'));

// 二维码落地页：/r/<token> → 解析后跳到物品或位置详情（客户端执行，接口需要登录态）
onMounted(async () => {
  try {
    const code = String(route.params.code);
    const result = await api.get<{ type: string; id: number; itemId?: number }>(`/scan/${encodeURIComponent(code)}`);
    if (result.type === 'location') await navigateTo(`/locations?focus=${result.id}`, { replace: true });
    else await navigateTo(`/items/${result.type === 'unit' ? result.itemId : result.id}`, { replace: true });
  } catch {
    message.value = t('scan.notFound');
    setTimeout(() => navigateTo('/scan', { replace: true }), 1200);
  }
});
</script>

<style scoped>
.resolving {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--hb-muted);
}
</style>
