<template>
  <UModal :open="open" :title="title" @update:open="emit('update:open', $event)">
    <template #body>
      <div class="sa">
        <label class="sa-field">
          <span class="sa-label">{{ t('item.adjustLevel') }}</span>
          <USelect v-model="level" :items="levelOptions" />
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
const { levels } = useUnits();

const amount = ref(1);
const note = ref('');
/** '' 表示按最小单位 */
const level = ref('');
const saving = ref(false);

const title = computed(() => t(props.mode === 'consume' ? 'item.consume' : 'item.restock'));

const levelOptions = computed(() => [
  { label: props.baseUnit || t('item.baseUnit'), value: '' },
  ...levels(props.packLevels).map((item) => ({ label: item.name, value: item.name })),
]);

const factor = computed(() => (level.value ? levels(props.packLevels).find((l) => l.name === level.value)?.factor ?? 1 : 1));
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
      level.value = '';
    }
  },
);

async function submit() {
  if (saving.value) return;
  saving.value = true;
  try {
    await api.post(`/items/${props.itemId}/${props.mode}`, {
      level: level.value || undefined,
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
