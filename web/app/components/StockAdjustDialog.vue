<template>
  <UModal :open="open" :title="title" @update:open="emit('update:open', $event)">
    <template #body>
      <div class="sa">
        <label class="sa-field">
          <span class="sa-label">{{ t('item.adjustLevel') }}</span>
          <USelect v-model="levelIndex" :items="levelOptions" />
        </label>

        <label class="sa-field">
          <span class="sa-label">{{ t('item.adjustAmount') }}</span>
          <UInput v-model.number="amount" type="number" min="1" inputmode="numeric" />
        </label>

        <label class="sa-field">
          <span class="sa-label">{{ t('item.adjustNote') }}</span>
          <UInput v-model="note" :placeholder="t('item.adjustNotePlaceholder')" />
        </label>

        <p class="sa-preview hb-muted">{{ t('item.adjustPreview', { change: preview }) }}</p>

        <div class="sa-actions">
          <UButton color="neutral" variant="soft" @click="emit('update:open', false)">
            {{ t('common.cancel') }}
          </UButton>
          <UButton
            :color="mode === 'consume' ? 'primary' : 'success'"
            :loading="saving"
            @click="submit"
          >
            {{ title }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { PackLevel } from '~/composables/useUnits';

const props = defineProps<{
  open: boolean;
  itemId: number;
  baseUnit: string | null;
  packLevels: PackLevel[];
  mode: 'consume' | 'restock';
}>();

const emit = defineEmits<{ 'update:open': [boolean]; done: [] }>();

const { t } = useI18n();
const api = useApi();
const toast = useToast();
const { choices } = useUnits();

const amount = ref(1);
const note = ref('');
/**
 * 选项下标：0 = 最小单位，1..n = 各级包装。
 *
 * 这里既不能用空字符串也不能用名字当 value：reka 的 SelectItem 对空字符串直接抛错
 * 「A <SelectItem /> must have a value prop that is not an empty string」
 * （空字符串被它保留表示「清空选择」）；而用哨兵字符串又可能与用户自定的级别名重名。
 * 用下标就没有这个问题，提交时再翻译回级别名。
 */
const levelIndex = ref(0);
const saving = ref(false);

const title = computed(() => t(props.mode === 'consume' ? 'item.consume' : 'item.restock'));

/** 档位列表：下标 0 = 最小单位，1..n = 各级包装（顺序与换算都由 choices() 保证） */
const levelChoices = computed(() => choices(props.packLevels));

const levelOptions = computed(() =>
  levelChoices.value.map((level, index) => ({
    label: level?.name ?? (props.baseUnit || t('item.baseUnit')),
    value: index,
  })),
);

/** 当前选中的包装级别；下标 0（按最小单位）时没有对应级别 */
const selectedLevel = computed(() => levelChoices.value[levelIndex.value] ?? null);

const factor = computed(() => selectedLevel.value?.factor ?? 1);
const preview = computed(() => {
  const total = Math.max(1, Math.floor(amount.value || 1)) * factor.value;
  const unit = props.baseUnit ?? '';
  return props.mode === 'consume' ? `−${total}${unit}` : `+${total}${unit}`;
});

watch(
  () => props.open,
  (open) => {
    if (open) {
      amount.value = 1;
      note.value = '';
      levelIndex.value = 0;
    }
  },
);

async function submit() {
  if (saving.value) return;
  saving.value = true;
  try {
    await api.post(`/items/${props.itemId}/${props.mode}`, {
      level: selectedLevel.value?.name,
      amount: Math.max(1, Math.floor(amount.value || 1)),
      note: note.value.trim() || undefined,
    });
    toast.add({
      title: t(props.mode === 'consume' ? 'item.consumeDone' : 'item.restockDone'),
      color: 'success',
    });
    emit('update:open', false);
    emit('done');
  } catch (error) {
    toast.add({ title: (error as { message?: string }).message ?? t('errors.unknown'), color: 'error' });
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.sa {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sa-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sa-label {
  font-size: var(--hb-fs-xs);
  color: var(--hb-muted);
}

.sa-preview {
  margin: 0;
  font-size: var(--hb-fs-sm);
}

.sa-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
