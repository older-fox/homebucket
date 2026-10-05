<template>
  <div>
    <PageHeader :title="t('template.title')">
      <template #actions>
        <UButton icon="i-lucide-plus" class="hb-tap" @click="openCreate">
          <span class="hide-sm">{{ t('template.new') }}</span>
        </UButton>
      </template>
    </PageHeader>

    <!-- 搜索：支持扫码匹配现有模板（扫到条码直接搜/建模板） -->
    <div class="hb-toolbar">
      <UInput
        v-model="q"
        :placeholder="t('template.searchPlaceholder')"
        icon="i-lucide-search"
        size="lg"
        class="hb-toolbar-grow"
        type="text"
        inputmode="search"
        enterkeyhint="search"
      />
      <UButton
        color="neutral"
        variant="soft"
        icon="i-lucide-scan-line"
        size="lg"
        class="hb-tap"
        @click="navigateTo('/scan?mode=template')"
      >
        {{ t('template.scanToFind') }}
      </UButton>
      <UButton v-if="q" color="neutral" variant="ghost" size="lg" icon="i-lucide-x" class="hb-tap" @click="q = ''" />
    </div>

    <div v-if="pending" class="hb-skeleton skeleton" />
    <EmptyState v-else-if="!templates.length" :text="t('template.empty')" icon="i-lucide-layers">
      <UButton size="sm" @click="openCreate">{{ t('template.new') }}</UButton>
    </EmptyState>

    <!-- 搜索无结果：直接用这个条码建模板 -->
    <div v-else-if="q && !filtered.length" class="no-match hb-card">
      <UIcon name="i-lucide-search-x" class="no-match-icon" />
      <p class="hb-muted">{{ t('template.noMatch', { query: q }) }}</p>
      <UButton icon="i-lucide-plus" class="hb-tap" @click="createFromQuery">
        {{ t('template.createWithBarcode') }}
      </UButton>
    </div>

    <div v-else class="grid">
      <article v-for="template in filtered" :key="template.id" class="card hb-card">
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
          <p v-if="template.barcode" class="meta">
            <UIcon name="i-lucide-barcode" class="meta-icon" />
            <span class="hb-mono">{{ template.barcode }}</span>
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
          <UFormField :label="t('item.barcode')" :hint="t('template.barcodeHint')">
            <div class="barcode-row">
              <UInput
                v-model="form.barcode"
                :placeholder="t('item.barcodePlaceholder')"
                icon="i-lucide-barcode"
                inputmode="numeric"
                size="xl"
                class="hb-mono"
              />
              <UButton
                color="neutral"
                variant="soft"
                icon="i-lucide-scan-line"
                size="xl"
                class="hb-tap"
                @click="scanIntoForm"
              />
            </div>
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
  barcode: string | null;
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
const route = useRoute();

const { data, pending, refresh } = await useAsyncData('templates', () => api.get<Template[]>('/templates'), {
  server: false,
  default: () => [],
});
const templates = computed(() => data.value ?? []);

const formOpen = ref(false);
const editing = ref<Template | null>(null);
const saving = ref(false);
const initialImage = ref<{ id: number; url: string }[]>([]);
const q = ref((route.query.q as string) ?? '');
/** 搜索：名称/描述/型号/制造商/条码/标签 */
const filtered = computed(() => {
  const keyword = q.value.trim().toLowerCase();
  if (!keyword) return templates.value;
  return templates.value.filter((template) =>
    [
      template.name,
      template.description ?? '',
      template.model ?? '',
      template.manufacturer ?? '',
      template.barcode ?? '',
      template.tags.map((tag) => tag.name).join(' '),
    ]
      .join(' ')
      .toLowerCase()
      .includes(keyword),
  );
});

const form = reactive<{
  name: string;
  barcode: string;
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
  barcode: '',
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
    barcode: template.barcode ?? '',
    defaultLocationId: template.defaultLocationId,
    tagIds: template.tags.map((tag) => tag.id),
    imageIds: [],
  });
  initialImage.value = template.imageUrl ? [] : [];
  formOpen.value = true;
}

/** 表单里的扫码：带 fill=1 去扫码页，回来时自动打开新建并填入条码 */
function scanIntoForm() {
  navigateTo('/scan?mode=template&fill=1');
}

/** 搜索无结果时，用搜索词当作条码直接建模板 */
function createFromQuery() {
  openCreate();
  form.barcode = q.value.trim();
}

// 从扫码页带 fill=1 回来：直接打开新建并填入扫到的条码
onMounted(() => {
  if (route.query.fill === '1' && q.value.trim()) createFromQuery();
});

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
      barcode: form.barcode.trim() || undefined,
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
.barcode-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.barcode-row :deep(input) {
  flex: 1;
  min-width: 0;
}

.meta-icon {
  width: 13px;
  height: 13px;
}

.no-match {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 36px 20px;
  text-align: center;
}

.no-match-icon {
  width: 28px;
  height: 28px;
  color: var(--hb-muted);
}

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
