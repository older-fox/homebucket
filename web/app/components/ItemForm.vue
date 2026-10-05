<template>
  <form class="item-form" @submit.prevent="submit">
    <!-- 新增时可套用模板：选中后自动预填各字段，物品会记录 templateId -->
    <div v-if="!itemId" class="template-bar">
      <UIcon name="i-lucide-layers" class="template-icon" />
      <USelect
        v-model="selectedTemplateId"
        :items="templateOptions"
        :placeholder="t('item.fromTemplateLabel')"
        size="lg"
        class="template-select"
        @update:model-value="onTemplateChange"
      />
      <UButton
        v-if="selectedTemplateId"
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        size="sm"
        :aria-label="t('common.cancel')"
        @click="clearTemplate"
      />
    </div>

    <p v-else-if="templateName" class="template-from">
      <UIcon name="i-lucide-layers" />
      {{ t('item.createdFrom') }}：{{ templateName }}
    </p>

    <UFormField :label="t('item.name')" required>
      <UInput v-model="form.name" size="xl" class="w-full" required />
    </UFormField>

    <div class="grid">
      <UFormField :label="t('item.quantity')">
        <UInput v-model.number="form.quantity" type="number" inputmode="numeric" min="0" size="xl" class="w-full" />
      </UFormField>
      <UFormField :label="t('item.price')" :hint="t('item.priceHint', { currency })">
        <UInput v-model.number="form.price" type="number" inputmode="decimal" step="0.01" min="0" size="xl" class="w-full" />
      </UFormField>
      <UFormField :label="t('item.model')">
        <UInput v-model="form.model" size="xl" class="w-full" />
      </UFormField>
      <UFormField :label="t('item.manufacturer')">
        <UInput v-model="form.manufacturer" size="xl" class="w-full" />
      </UFormField>
    </div>

    <UFormField :label="t('item.location')">
      <LocationPicker v-model="form.locationId" />
    </UFormField>

    <UFormField :label="t('item.tags')">
      <TagPicker v-model="form.tagIds" />
    </UFormField>

    <UFormField :label="t('item.description')">
      <UTextarea v-model="form.description" :rows="3" size="xl" class="w-full" />
    </UFormField>

    <UFormField :label="t('item.photos')">
      <PhotoUploader v-model="form.imageIds" :initial="initialImages" />
    </UFormField>

    <UFormField v-if="form.imageIds.length > 1" :label="t('item.cover')">
      <USelect v-model="form.coverImageId" :items="coverOptions" class="w-full" size="xl" />
    </UFormField>

    <!-- 新增时可直接登记 SN，每个 SN 可以放在不同位置 -->
    <UFormField v-if="!itemId" :label="t('item.units')">
      <div class="units">
        <div v-for="(unit, index) in form.units" :key="index" class="unit-row">
          <UInput v-model="unit.sn" :placeholder="t('item.sn')" size="lg" class="unit-sn" />
          <LocationPicker v-model="unit.locationId" class="unit-location" />
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-trash-2"
            :aria-label="t('common.delete')"
            @click="form.units.splice(index, 1)"
          />
        </div>
        <UButton color="neutral" variant="soft" icon="i-lucide-plus" block class="hb-tap" @click="addUnit">
          {{ t('item.addUnit') }}
        </UButton>
      </div>
    </UFormField>

    <div class="actions">
      <UButton type="submit" size="xl" class="hb-tap" :loading="saving">{{ t('common.save') }}</UButton>
      <UButton color="neutral" variant="ghost" size="xl" class="hb-tap" @click="navigateTo('/items')">
        {{ t('common.cancel') }}
      </UButton>
    </div>
  </form>
</template>

<script setup lang="ts">
interface Template {
  id: number;
  name: string;
  description: string | null;
  quantity: number;
  price: number;
  model: string | null;
  manufacturer: string | null;
  defaultLocationId: number | null;
  imageId: number | null;
  imageUrl: string | null;
  tags: { id: number }[];
}

interface ItemDetail {
  id: number;
  name: string;
  description: string | null;
  quantity: number;
  price: number;
  model: string | null;
  manufacturer: string | null;
  location: { id: number } | null;
  tags: { id: number }[];
  images: { id: number; url: string }[];
  coverImageUrl: string | null;
  template: { id: number; name: string } | null;
}

const props = defineProps<{ itemId?: number; templateId?: number }>();
const emit = defineEmits<{ saved: [number] }>();

const { t } = useI18n();
const api = useApi();
const toast = useToast();
const { currency } = useFormat();

const saving = ref(false);
const initialImages = ref<{ id: number; url: string }[]>([]);
const templates = ref<Template[]>([]);
const selectedTemplateId = ref<number | undefined>(props.templateId ?? undefined);
const templateName = ref<string | null>(null);

const templateOptions = computed(() =>
  templates.value.map((template) => ({ label: template.name, value: template.id })),
);

const form = reactive<{
  name: string;
  description: string;
  quantity: number;
  price: number;
  model: string;
  manufacturer: string;
  locationId: number | null;
  tagIds: number[];
  imageIds: number[];
  coverImageId: number | null;
  units: { sn: string; locationId: number | null }[];
}>({
  name: '',
  description: '',
  quantity: 1,
  price: 0,
  model: '',
  manufacturer: '',
  locationId: null,
  tagIds: [],
  imageIds: [],
  coverImageId: null,
  units: [],
});

const coverOptions = computed(() => [
  { label: t('item.cover'), value: null },
  ...initialImages.value
    .filter((image) => form.imageIds.includes(image.id))
    .map((image, index) => ({ label: `${t('item.cover')} ${index + 1}`, value: image.id })),
]);

onMounted(async () => {
  if (props.itemId) {
    const item = await api.get<ItemDetail>(`/items/${props.itemId}`);
    Object.assign(form, {
      name: item.name,
      description: item.description ?? '',
      quantity: item.quantity,
      price: item.price,
      model: item.model ?? '',
      manufacturer: item.manufacturer ?? '',
      locationId: item.location?.id ?? null,
      tagIds: item.tags.map((tag) => tag.id),
      imageIds: item.images.map((image) => image.id),
      coverImageId: null,
    });
    initialImages.value = item.images;
    templateName.value = item.template?.name ?? null;
  } else {
    // 新增：加载模板列表供选择
    templates.value = await api.get<Template[]>('/templates');
    if (selectedTemplateId.value) await applyTemplate(selectedTemplateId.value);
  }
});

/** 套用模板：把模板字段填进表单（不覆盖用户已填的名称） */
async function applyTemplate(templateId: number) {
  try {
    const template = await api.get<Template>(`/templates/${templateId}`);
    templateName.value = template.name;
    Object.assign(form, {
      name: form.name || template.name,
      description: template.description ?? '',
      quantity: template.quantity,
      price: template.price,
      model: template.model ?? '',
      manufacturer: template.manufacturer ?? '',
      locationId: template.defaultLocationId,
      tagIds: template.tags.map((tag) => tag.id),
      imageIds: template.imageId ? [template.imageId] : [],
    });
    if (template.imageId) {
      initialImages.value = [{ id: template.imageId, url: template.imageUrl ?? '' }];
    }
  } catch (error) {
    toast.add({ title: (error as { message?: string }).message ?? t('errors.unknown'), color: 'error' });
  }
}

function onTemplateChange(value: number) {
  selectedTemplateId.value = value ?? undefined;
  if (value) void applyTemplate(value);
}

function clearTemplate() {
  selectedTemplateId.value = undefined;
  templateName.value = null;
}

function addUnit() {
  form.units.push({ sn: '', locationId: null });
}

async function submit() {
  saving.value = true;
  try {
    const payload = {
      name: form.name,
      description: form.description || undefined,
      quantity: form.quantity,
      price: form.price,
      model: form.model || undefined,
      manufacturer: form.manufacturer || undefined,
      locationId: form.locationId ?? undefined,
      tagIds: form.tagIds,
      imageIds: form.imageIds,
      coverImageId: form.coverImageId ?? undefined,
    };

    if (props.itemId) {
      await api.patch(`/items/${props.itemId}`, payload);
      toast.add({ title: t('item.savedHint'), color: 'success' });
      emit('saved', props.itemId);
    } else {
      const created = await api.post<{ id: number }>('/items', {
        ...payload,
        templateId: selectedTemplateId.value ?? undefined,
        units: form.units
          .filter((unit) => unit.sn.trim())
          .map((unit) => ({ sn: unit.sn.trim(), locationId: unit.locationId ?? undefined })),
      });
      toast.add({ title: t('item.savedHint'), color: 'success' });
      await navigateTo(`/items/${created.id}`);
    }
  } catch (error) {
    toast.add({ title: (error as { message?: string }).message ?? t('errors.unknown'), color: 'error' });
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.item-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 720px;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.units {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.unit-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.unit-sn {
  flex: 1 1 40%;
}

.unit-location {
  flex: 1 1 60%;
}

.template-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--hb-r-md);
  border: 1px dashed var(--hb-border-strong);
  background: var(--hb-surface-2);
}

.template-icon {
  width: 18px;
  height: 18px;
  color: var(--hb-brand);
  flex-shrink: 0;
}

.template-select {
  flex: 1;
  min-width: 0;
}

.template-from {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 8px 12px;
  border-radius: var(--hb-r-sm);
  background: var(--hb-brand-soft);
  color: var(--hb-brand);
  font-size: var(--hb-fs-sm);
  font-weight: var(--hb-fw-medium);
}

.template-from :deep(svg) {
  width: 15px;
  height: 15px;
}

.actions {
  display: flex;
  gap: 8px;
  padding-top: 4px;
}

@media (max-width: 640px) {
  .grid {
    grid-template-columns: 1fr;
  }

  .unit-row {
    flex-wrap: wrap;
  }

  .unit-sn,
  .unit-location {
    flex: 1 1 100%;
  }
}
</style>
