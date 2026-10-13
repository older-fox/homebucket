<template>
  <div class="fields">
    <div
      v-for="item in items"
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
          <UBadge variant="soft" color="neutral" size="sm">
            {{ t(sourceKey[item.source] ?? 'settings.sourceDefault') }}
          </UBadge>
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
        @update:model-value="(value: boolean) => emit('set', item.envName, value)"
      />
      <USelect
        v-else-if="item.type === 'enum'"
        :id="`setting-${item.envName}`"
        :model-value="String(draft[item.envName] ?? '')"
        :items="item.enumValues ?? []"
        size="xl"
        class="w-full"
        @update:model-value="(value) => emit('set', item.envName, value)"
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
        @update:model-value="(value) => emit('set', item.envName, value)"
      />

      <p v-if="item.type === 'secret'" class="note">{{ t('settings.secretKeepHint') }}</p>
      <p v-if="item.warning" class="warn">{{ t(`settings.warning.${item.warning}`) }}</p>

      <div v-if="item.hasOverride" class="field-foot">
        <UButton size="xs" variant="ghost" color="neutral" class="hb-tap" @click="emit('reset', item)">
          {{ t('settings.resetToDefault') }}
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { InstanceSetting } from '../composables/useInstanceSettings';

const { t } = useI18n();

/**
 * 纯展示的"设置字段列表"：设置页与首启引导页共用同一份渲染，两个入口的字段样式、
 * 徽标、风险提示才不会长歪（引导页第 3/4 步显示的就是这里渲染的同一批字段）。
 *
 * 状态全在外部：本组件只负责画，改值通过 `set` 事件交给调用方 —— 这样设置页与
 * 引导页可以各自决定"草稿存在哪、什么时候保存"。
 */
const props = defineProps<{
  items: InstanceSetting[];
  /** 当前草稿：bool 存布尔，其余存字符串 */
  draft: Record<string, string | boolean>;
  isDirty: (envName: string) => boolean;
  /** 来源 → 文案 key */
  sourceKey: Record<string, string>;
}>();

const emit = defineEmits<{
  set: [envName: string, value: unknown];
  reset: [item: InstanceSetting];
}>();

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

/* 动过的项加一道左侧色条：几十个字段里一眼看到自己改了哪几项 */
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

.hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--hb-text-2);
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
