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

          <div class="fields">
            <div
              v-for="item in itemsOf(group)"
              :key="item.envName"
              class="field"
              :class="{ dirty: isDirty(item.envName) }"
            >
              <div class="field-head">
                <label :for="`setting-${item.envName}`" class="field-label">
                  {{ t(`settings.fields.${item.envName}.label`) }}
                  <code class="env">{{ item.envName }}</code>
                </label>
                <div class="badges">
                  <UBadge variant="soft" color="neutral" size="sm">{{ t(sourceKey[item.source]) }}</UBadge>
                  <!-- 待重启的项只显示警示徽标：它已经蕴含了「需重启生效」 -->
                  <UBadge v-if="item.pendingRestart" variant="soft" color="warning" size="sm">
                    {{ t('settings.pendingRestart') }}
                  </UBadge>
                  <UBadge v-else-if="item.restartRequired" variant="soft" color="neutral" size="sm">
                    {{ t('settings.restartRequired') }}
                  </UBadge>
                </div>
              </div>

              <p class="hint">{{ t(`settings.fields.${item.envName}.hint`) }}</p>

              <USwitch
                v-if="item.type === 'bool'"
                :id="`setting-${item.envName}`"
                :model-value="draft[item.envName] === true"
                @update:model-value="(value: boolean) => setDraft(item.envName, value)"
              />
              <USelect
                v-else-if="item.type === 'enum'"
                :id="`setting-${item.envName}`"
                :model-value="String(draft[item.envName] ?? '')"
                :items="item.enumValues ?? []"
                size="xl"
                class="w-full"
                @update:model-value="(value) => setDraft(item.envName, value)"
              />
              <UInput
                v-else
                :id="`setting-${item.envName}`"
                :model-value="String(draft[item.envName] ?? '')"
                size="xl"
                class="w-full"
                :type="item.type === 'secret' ? 'password' : item.type === 'int' ? 'number' : 'text'"
                :min="item.min"
                :max="item.max"
                :maxlength="item.maxLength"
                :placeholder="placeholderOf(item)"
                @update:model-value="(value) => setDraft(item.envName, value)"
              />

              <p v-if="item.type === 'secret'" class="note">{{ t('settings.secretKeepHint') }}</p>
              <p v-if="item.warning" class="warn">{{ t(`settings.warning.${item.warning}`) }}</p>

              <div v-if="item.hasOverride" class="field-foot">
                <UButton size="xs" variant="ghost" color="neutral" class="hb-tap" @click="resetField(item)">
                  {{ t('settings.resetToDefault') }}
                </UButton>
              </div>
            </div>
          </div>
        </template>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import type { InstanceSetting } from '../composables/useInstanceSettings';

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

/**
 * 占位提示按类型给：
 *   · 密钥类：不回传明文，所以只能提示"已设置 / 未设置"，配合下面那行"留空表示不修改"
 *   · size / cron：给个格式样例（与 .env.example 里的写法一致）
 */
function placeholderOf(item: InstanceSetting): string {
  if (item.type === 'secret') return item.isSet ? t('settings.secretSet') : t('settings.secretUnset');
  if (item.type === 'size') return '1gb';
  if (item.type === 'cron') return '0 0 3 * * *';
  return '';
}
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

.fields {
  display: grid;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: var(--hb-r-lg);
  border: 1px solid var(--hb-border);
  background: var(--hb-surface);
}

/* 动过的项加一道左侧色条：39 个字段里一眼看到自己改了哪几项 */
.field.dirty {
  border-left: 3px solid var(--hb-brand);
}

.field-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.field-label {
  font-size: 14px;
  font-weight: 500;
}

.env {
  margin-left: 6px;
  font-size: 11px;
  color: var(--hb-text-2);
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.note {
  margin: 0;
  font-size: 12px;
  color: var(--hb-text-2);
}

.warn {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--hb-danger);
}

.field-foot {
  display: flex;
  justify-content: flex-end;
}
</style>
