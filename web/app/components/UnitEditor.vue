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

/* ⚠️ 必须用 :deep()：LocationPicker 的根是 USelect 的 <button>，
   scoped 属性（data-v-*）不会落到子组件根节点上，因此
   `.location { flex: ... }` 是死规则（实测 computed flex-grow 一直是 0）。
   后果是位置选择器的宽度由位置名称长短决定 —— 名称一长就把 SN 输入框挤窄，
   行布局随数据抖动。用 :deep() 才能让 40/60 的比例真正生效。 */
.unit-editor :deep(.location) {
  flex: 1 1 60%;
  min-width: 0;
}

.add {
  padding-top: 4px;
}

@media (max-width: 640px) {
  .row {
    flex-wrap: wrap;
  }

  /* 这里只让 SN 独占一行。位置选择器**不需要**再写 100%：
     上面的 `.unit-editor :deep(.location) { flex: 1 1 60% }` 在换行后的
     剩余空间里会 grow 填满，正好与删除按钮并排（实测 390px 下
     SN=350、位置=310、删除=32，两行，视觉正常）。
     另外注意：这里也不能写成 `.location { ... }` —— LocationPicker 的根节点
     拿不到 scoped 属性，那样写是死规则（见上方说明）。 */
  .sn {
    flex: 1 1 100%;
  }
}
</style>
