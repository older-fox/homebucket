<template>
  <UDropdownMenu :items="menuItems" :content="{ align: 'start' }">
    <button type="button" class="switcher hb-tap">
      <span class="avatar">{{ initial }}</span>
      <span class="texts">
        <span class="name">{{ current?.name ?? '—' }}</span>
        <span class="role">{{ roleLabel }}</span>
      </span>
      <UIcon name="i-lucide-chevrons-up-down" class="chev" />
    </button>
  </UDropdownMenu>
</template>

<script setup lang="ts">
const { families, current, switchTo, load } = useFamily();
const { t } = useI18n();

onMounted(load);

const initial = computed(() => (current.value?.name ?? 'H').slice(0, 1).toUpperCase());

const roleLabel = computed(() => {
  const role = current.value?.role;
  if (role === 'owner') return t('settings.owner');
  if (role === 'admin') return t('settings.admin');
  return t('settings.member');
});

const menuItems = computed(() => [
  families.value.map((family) => ({
    label: `${family.id === current.value?.id ? '● ' : '○ '}${family.name}`,
    onSelect: () => {
      if (family.id !== current.value?.id) void switchTo(family.id);
    },
  })),
  [
    {
      label: t('settings.family'),
      icon: 'i-lucide-settings',
      onSelect: () => navigateTo('/settings'),
    },
  ],
]);
</script>

<style scoped>
.switcher {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--hb-r-sm);
  background: transparent;
  color: var(--hb-text);
  cursor: pointer;
  text-align: left;
  transition: background var(--hb-dur) var(--hb-ease);
}

.switcher:hover {
  background: var(--hb-surface-3);
}

.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--hb-r-sm);
  background: linear-gradient(135deg, var(--hb-brand), var(--hb-brand-strong));
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}

.texts {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}

.name {
  font-size: 13.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role {
  font-size: 11px;
  color: var(--hb-muted);
}

.chev {
  width: 15px;
  height: 15px;
  color: var(--hb-muted);
  flex-shrink: 0;
}
</style>
