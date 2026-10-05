<template>
  <div class="unit-editor">
    <div v-for="unit in units" :key="unit.id" class="row">
      <UInput
        :model-value="unit.sn ?? ''"
        :placeholder="t('item.sn')"
        size="lg"
        class="sn"
        @update:model-value="(value: string) => saveSn(unit, value)"
      />
      <LocationPicker
        :model-value="unit.locationId"
        class="location"
        @update:model-value="(value: number | null) => saveLocation(unit, value)"
      />
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-trash-2"
        :aria-label="t('common.delete')"
        @click="remove(unit.id)"
      />
    </div>

    <EmptyState v-if="!units.length" :text="t('item.noUnits')" icon="i-lucide-barcode" />

    <div class="row add">
      <UInput v-model="draft.sn" :placeholder="t('item.sn')" size="lg" class="sn" />
      <LocationPicker v-model="draft.locationId" class="location" />
      <UButton icon="i-lucide-plus" class="hb-tap" :loading="adding" @click="add">{{ t('common.add') }}</UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Unit {
  id: number;
  sn: string | null;
  locationId: number | null;
  location: { id: number; name: string } | null;
}

const props = defineProps<{ itemId: number; units: Unit[] }>();
const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();
const api = useApi();
const toast = useToast();

const draft = reactive<{ sn: string; locationId: number | null }>({ sn: '', locationId: null });
const adding = ref(false);

function fail(error: unknown) {
  toast.add({ title: (error as { message?: string }).message ?? t('errors.unknown'), color: 'error' });
}

async function add() {
  if (!draft.sn.trim() && !draft.locationId) return;
  adding.value = true;
  try {
    await api.post(`/items/${props.itemId}/units`, {
      sn: draft.sn.trim() || undefined,
      locationId: draft.locationId ?? undefined,
    });
    draft.sn = '';
    draft.locationId = null;
    emit('changed');
  } catch (error) {
    fail(error);
  } finally {
    adding.value = false;
  }
}

async function saveSn(unit: Unit, value: string) {
  const sn = value.trim();
  if (sn === (unit.sn ?? '')) return;
  try {
    await api.patch(`/items/${props.itemId}/units/${unit.id}`, { sn: sn || undefined });
    emit('changed');
  } catch (error) {
    fail(error);
    emit('changed');
  }
}

async function saveLocation(unit: Unit, value: number | null) {
  if (value === unit.locationId) return;
  try {
    await api.patch(`/items/${props.itemId}/units/${unit.id}`, { locationId: value ?? undefined });
    emit('changed');
  } catch (error) {
    fail(error);
    emit('changed');
  }
}

async function remove(unitId: number) {
  try {
    await api.del(`/items/${props.itemId}/units/${unitId}`);
    emit('changed');
  } catch (error) {
    fail(error);
  }
}
</script>

<style scoped>
.unit-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.sn {
  flex: 1 1 40%;
}

.location {
  flex: 1 1 60%;
}

.add {
  padding-top: 4px;
}

@media (max-width: 640px) {
  .row {
    flex-wrap: wrap;
  }

  .sn,
  .location {
    flex: 1 1 100%;
  }
}
</style>
