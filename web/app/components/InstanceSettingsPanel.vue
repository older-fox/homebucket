<template>
  <section class="panel">
    <div class="panel-head">
      <div class="head-text">
        <h2>{{ t('settings.instance') }}</h2>
        <p class="hint">{{ t('settings.instanceHint') }}</p>
      </div>
      <div class="head-actions">
        <UInput
          v-model="search"
          size="xl"
          icon="i-lucide-search"
          class="search"
          :placeholder="t('settings.searchPlaceholder')"
        />
        <UButton
          size="xl"
          class="hb-tap"
          :loading="saving"
          :disabled="dirtyKeys.length === 0"
          @click="save"
        >
          {{ t('settings.saveInstance') }}
        </UButton>
      </div>
    </div>

    <p v-if="dirtyKeys.length > 0" class="dirty-note">
      {{ t('settings.dirtyCount', { count: dirtyKeys.length }) }}
    </p>

    <p v-if="loading" class="hint">{{ t('common.loading') }}</p>
    <p v-else-if="!hasVisibleItems" class="hint">{{ t('common.empty') }}</p>

    <template v-else>
      <section v-for="group in groups" :key="group" class="group">
        <template v-if="itemsOf(group).length > 0">
          <h3 class="group-title">{{ t(`settings.groups.${group}`) }}</h3>
          <SettingsFields
            :items="itemsOf(group)"
            :draft="draft"
            :is-dirty="isDirty"
            :source-key="sourceKey"
            @set="setDraft"
            @reset="resetField"
          />
        </template>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
const { t } = useI18n();
const {
  groups,
  loading,
  saving,
  search,
  draft,
  dirtyKeys,
  hasVisibleItems,
  itemsOf,
  isDirty,
  setDraft,
  resetField,
  load,
  save,
  sourceKey,
} = useInstanceSettings();

// 只有实例管理员进得来（页面侧也按这个标记决定 tab 显不显示），所以进面板就加载
onMounted(() => {
  if (useAuth().user.value?.isInstanceAdmin) void load();
});
</script>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.head-text {
  min-width: 0;
}

.head-text h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search {
  width: 15rem;
}

.hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--hb-text-2);
}

.dirty-note {
  margin: 0;
  font-size: 12px;
  color: var(--hb-brand);
}

.group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.group-title {
  margin: 8px 0 0;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--hb-text-2);
}
</style>
