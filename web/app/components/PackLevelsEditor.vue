<template>
  <div class="ple">
    <label class="ple-field">
      <span class="ple-label">{{ t('item.baseUnit') }}</span>
      <UInput
        :model-value="baseUnit ?? ''"
        :placeholder="t('item.baseUnitPlaceholder')"
        @update:model-value="onBase"
      />
    </label>

    <div v-for="(level, index) in rows" :key="index" class="ple-row">
      <UInput
        :model-value="level.name"
        :placeholder="t('item.packName')"
        @update:model-value="(value) => onName(index, value)"
      />
      <UInput
        :model-value="level.factor"
        type="number"
        min="2"
        inputmode="numeric"
        :placeholder="t('item.packFactor')"
        @update:model-value="(value) => onFactor(index, value)"
      />
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-trash-2"
        :aria-label="t('common.delete')"
        @click="remove(index)"
      />
    </div>

    <UButton
      v-if="rows.length < 5"
      color="neutral"
      variant="soft"
      size="sm"
      icon="i-lucide-plus"
      @click="add"
    >
      {{ t('item.packAddLevel') }}
    </UButton>

    <p class="ple-hint hb-muted">{{ t('item.packHint') }}</p>
  </div>
</template>

<script setup lang="ts">
import type { PackLevel } from '~/composables/useUnits';

const props = defineProps<{
  baseUnit: string | null;
  packLevels: PackLevel[];
}>();

const emit = defineEmits<{
  'update:base-unit': [string | null];
  'update:pack-levels': [PackLevel[]];
}>();

const { t } = useI18n();

const rows = computed(() => props.packLevels ?? []);

function emitLevels(next: PackLevel[]) {
  emit('update:pack-levels', next.slice(0, 5));
}

function onBase(value: string | number) {
  emit('update:base-unit', String(value).trim() || null);
}

function onName(index: number, value: string | number) {
  emitLevels(rows.value.map((row, i) => (i === index ? { ...row, name: String(value) } : row)));
}

function onFactor(index: number, value: string | number) {
  const factor = Math.floor(Number(value));
  emitLevels(rows.value.map((row, i) => (i === index ? { ...row, factor: Number.isFinite(factor) ? factor : 2 } : row)));
}

function add() {
  emitLevels([...rows.value, { name: '', factor: 2 }]);
}

function remove(index: number) {
  emitLevels(rows.value.filter((_, i) => i !== index));
}
</script>

<style scoped>
.ple {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ple-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ple-label {
  font-size: var(--hb-fs-xs);
  color: var(--hb-muted);
}

.ple-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ple-row > :first-child {
  flex: 1;
}

.ple-row > :nth-child(2) {
  width: 96px;
}

.ple-hint {
  margin: 0;
  font-size: var(--hb-fs-xs);
  line-height: 1.5;
}
</style>
