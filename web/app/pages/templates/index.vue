<template>
  <div>
    <PageHeader :title="t('template.title')">
      <template #actions>
        <UButton icon="i-lucide-plus" class="hb-tap" @click="openCreate">
          <span class="hide-sm">{{ t('template.new') }}</span>
        </UButton>
      </template>
    </PageHeader>

    <div v-if="pending" class="hb-skeleton skeleton" />
    <EmptyState v-else-if="!templates.length" :text="t('template.empty')" icon="i-lucide-layers">
      <UButton size="sm" @click="openCreate">{{ t('template.new') }}</UButton>
    </EmptyState>

    <div v-else class="grid">
      <article v-for="template in templates" :key="template.id" class="card hb-card">
        <img v-if="template.imageUrl" :src="template.imageUrl" class="cover" :alt="template.name" />
        <div class="body">
          <h3>{{ template.name }}</h3>
          <p v-if="template.description" class="desc">{{ template.description }}</p>
          <p class="meta">
            <span v-if="template.model">{{ template.model }}</span>
            <span v-if="template.manufacturer">· {{ template.manufacturer }}</span>
            <span>· ×{{ template.quantity }}</span>
            <span>· {{ money(template.price) }}</span>
          </p>
          <p class="meta">
            <span>{{ template.defaultLocation?.name || t('item.noLocation') }}</span>
            <span v-for="tag in template.tags" :key="tag.id" class="tag" :style="{ color: tag.color, borderColor: tag.color }">
              {{ tag.name }}
            </span>
          </p>
        </div>
        <div class="ops">
          <UButton size="sm" icon="i-lucide-plus" class="hb-tap" @click="navigateTo(`/items/new?templateId=${template.id}`)">
            {{ t('template.useTemplate') }}
          </UButton>
          <UButton color="neutral" variant="soft" size="sm" icon="i-lucide-pencil" class="hb-tap" @click="openEdit(template)">
            {{ t('common.edit') }}
          </UButton>
          <UButton color="error" variant="ghost" size="sm" icon="i-lucide-trash-2" class="hb-tap" @click="remove(template)">
            {{ t('common.delete') }}
          </UButton>
        </div>
      </article>
    </div>

    <UModal v-model:open="formOpen" :title="editing ? t('template.edit') : t('template.new')">
      <template #body>
        <form class="form" @submit.prevent="save">
          <UFormField :label="t('template.name')" required>
            <UInput v-model="form.name" size="xl" class="w-full" required />
          </UFormField>
          <div class="grid-2">
            <UFormField :label="t('item.quantity')">
              <UInput v-model.number="form.quantity" type="number" inputmode="numeric" min="0" size="xl" class="w-full" />
            </UFormField>
            <UFormField :label="t('item.price')">
              <UInput v-model.number="form.price" type="number" inputmode="decimal" step="0.01" size="xl" class="w-full" />
            </UFormField>
            <UFormField :label="t('item.model')">
              <UInput v-model="form.model" size="xl" class="w-full" />
            </UFormField>
            <UFormField :label="t('item.manufacturer')">
              <UInput v-model="form.manufacturer" size="xl" class="w-full" />
            </UFormField>
          </div>
          <UFormField :label="t('template.defaultLocation')">
            <LocationPicker v-model="form.defaultLocationId" />
          </UFormField>
          <UFormField :label="t('template.defaultTags')">
            <TagPicker v-model="form.tagIds" />
          </UFormField>
          <UFormField :label="t('template.image')">
            <PhotoUploader v-model="form.imageIds" :multiple="false" :initial="initialImage" />
          </UFormField>
          <UFormField :label="t('common.description')">
            <UTextarea v-model="form.description" :rows="3" size="xl" class="w-full" />
          </UFormField>
          <div class="form-actions">
            <UButton type="submit" size="xl" class="hb-tap" :loading="saving">{{ t('common.save') }}</UButton>
            <UButton color="neutral" variant="ghost" size="xl" class="hb-tap" @click="formOpen = false">
              {{ t('common.cancel') }}
            </UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
interface Template {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  quantity: number;
  price: number;
  model: string | null;
  manufacturer: string | null;
  defaultLocationId: number | null;
  defaultLocation: { id: number; name: string } | null;
  tags: { id: number; name: string; color: string }[];
  itemCount: number;
}

const { t } = useI18n();
const api = useApi();
const toast = useToast();
const { money } = useFormat();

const { data, pending, refresh } = await useAsyncData('templates', () => api.get<Template[]>('/templates'), {
  server: false,
  default: () => [],
});
const templates = computed(() => data.value ?? []);

const formOpen = ref(false);
const editing = ref<Template | null>(null);
const saving = ref(false);
const initialImage = ref<{ id: number; url: string }[]>([]);
const form = reactive<{
  name: string;
  description: string;
  quantity: number;
  price: number;
  model: string;
  manufacturer: string;
  defaultLocationId: number | null;
  tagIds: number[];
  imageIds: number[];
}>({
  name: '',
  description: '',
  quantity: 1,
  price: 0,
  model: '',
  manufacturer: '',
  defaultLocationId: null,
  tagIds: [],
  imageIds: [],
});

function openCreate() {
  editing.value = null;
  Object.assign(form, {
    name: '',
    description: '',
    quantity: 1,
    price: 0,
    model: '',
    manufacturer: '',
    defaultLocationId: null,
    tagIds: [],
    imageIds: [],
  });
  initialImage.value = [];
  formOpen.value = true;
}

function openEdit(template: Template) {
  editing.value = template;
  Object.assign(form, {
    name: template.name,
    description: template.description ?? '',
    quantity: template.quantity,
    price: template.price,
    model: template.model ?? '',
    manufacturer: template.manufacturer ?? '',
    defaultLocationId: template.defaultLocationId,
    tagIds: template.tags.map((tag) => tag.id),
    imageIds: [],
  });
  initialImage.value = template.imageUrl ? [] : [];
  formOpen.value = true;
}

async function save() {
  saving.value = true;
  try {
    const payload = {
      name: form.name,
      description: form.description || undefined,
      quantity: form.quantity,
      price: form.price,
      model: form.model || undefined,
      manufacturer: form.manufacturer || undefined,
      defaultLocationId: form.defaultLocationId ?? undefined,
      tagIds: form.tagIds,
      imageId: form.imageIds[0] ?? undefined,
    };
    if (editing.value) await api.patch(`/templates/${editing.value.id}`, payload);
    else await api.post('/templates', payload);
    formOpen.value = false;
    await refresh();
    toast.add({ title: t('common.saved'), color: 'success' });
  } catch (error) {
    toast.add({ title: (error as { message?: string }).message ?? t('errors.unknown'), color: 'error' });
  } finally {
    saving.value = false;
  }
}

async function remove(template: Template) {
  if (!window.confirm(t('template.deleteConfirm', { name: template.name }))) return;
  try {
    await api.del(`/templates/${template.id}`);
    await refresh();
    toast.add({ title: t('common.deleted'), color: 'success' });
  } catch (error) {
    toast.add({ title: (error as { message?: string }).message ?? t('errors.unknown'), color: 'error' });
  }
}
</script>

<style scoped>
.skeleton {
  height: 160px;
  border-radius: 12px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.cover {
  width: 100%;
  height: 120px;
  object-fit: cover;
}

.body {
  padding: 12px 14px 4px;
}

h3 {
  margin: 0;
  font-size: var(--hb-fs-h3);
}

.desc {
  margin: 4px 0 0;
  font-size: var(--hb-fs-sm);
  color: var(--hb-muted);
}

.meta {
  margin: 6px 0 0;
  font-size: var(--hb-fs-xs);
  color: var(--hb-muted);
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.tag {
  padding: 0 8px;
  border: 1px solid;
  border-radius: 999px;
}

.ops {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 14px 14px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 640px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }

  .hide-sm {
    display: none;
  }
}
</style>
