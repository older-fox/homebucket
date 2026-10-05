<template>
  <!-- 新建 / 编辑位置 -->
  <UModal
    v-model:open="formOpen"
    :title="editingId ? t('location.edit') : t('location.new')"
    :fullscreen="isMobile"
    class="fill-modal"
  >
    <template #body>
      <form class="form" @submit.prevent="save">
        <UFormField :label="t('location.name')" required>
          <UInput v-model="form.name" size="xl" class="w-full" required />
        </UFormField>
        <UFormField :label="t('location.parent')">
          <USelect v-model="form.parentId" :items="parentOptions" class="w-full" size="xl" />
        </UFormField>
        <UFormField :label="t('location.description')">
          <UTextarea v-model="form.description" :rows="3" size="xl" class="w-full" />
        </UFormField>
        <UFormField :label="t('location.photo')">
          <PhotoUploader v-model="form.imageIds" :multiple="false" :initial="initialImage" />
        </UFormField>

        <div class="form-actions">
          <UButton type="submit" size="xl" class="hb-tap" :loading="saving">{{ t('common.save') }}</UButton>
          <UButton color="neutral" variant="ghost" size="xl" class="hb-tap" @click="formOpen = false">
            {{ t('common.cancel') }}
          </UButton>
          <UButton
            v-if="editingId"
            color="error"
            variant="ghost"
            size="xl"
            icon="i-lucide-trash-2"
            class="hb-tap push-end"
            @click="removeEditing"
          >
            <span class="hide-sm">{{ t('common.delete') }}</span>
          </UButton>
        </div>
      </form>
    </template>
  </UModal>

  <!-- 位置二维码 -->
  <UModal v-model:open="qrOpen" :title="t('location.qrCode')">
    <template #body>
      <div class="qr-box">
        <img v-if="qrUrl" :src="qrUrl" :alt="t('location.qrCode')" />
        <p v-else class="hb-muted">{{ t('common.loading') }}</p>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
interface TreeNode {
  id: number;
  name: string;
  parentId: number | null;
}

const emit = defineEmits<{ saved: []; deleted: [number] }>();

const { t } = useI18n();
const api = useApi();
const toast = useToast();

const formOpen = ref(false);
const editingId = ref<number | null>(null);
const saving = ref(false);
const initialImage = ref<{ id: number; url: string }[]>([]);
const parentOptions = ref<{ label: string; value: number }[]>([]);

const form = reactive<{ name: string; description: string; parentId: number | undefined; imageIds: number[] }>({
  name: '',
  description: '',
  parentId: undefined,
  imageIds: [],
});

const qrOpen = ref(false);
const qrUrl = ref('');

/** 移动端弹窗全屏 */
const isMobile = useBreakpoint();

function flatten(nodes: TreeNode[], depth = 0): { label: string; value: number }[] {
  return nodes.flatMap((node) => [
    { label: `${'　'.repeat(depth)}${node.name}`, value: node.id },
    ...flatten((node as TreeNode & { children?: TreeNode[] }).children ?? [], depth + 1),
  ]);
}

async function loadParentOptions() {
  try {
    const tree = await api.get<TreeNode[]>('/locations/tree');
    parentOptions.value = [{ label: t('location.root'), value: -1 }, ...flatten(tree)];
  } catch {
    parentOptions.value = [{ label: t('location.root'), value: -1 }];
  }
}

/** 新建：parentId 为 null 表示建在根下 */
async function openCreate(parentId: number | null) {
  editingId.value = null;
  Object.assign(form, { name: '', description: '', parentId: parentId ?? undefined, imageIds: [] });
  initialImage.value = [];
  await loadParentOptions();
  formOpen.value = true;
}

/** 编辑：只需 id，内部拉一次详情回填 */
async function openEdit(id: number) {
  await loadParentOptions();
  try {
    const location = await api.get<{
      id: number;
      name: string;
      description: string | null;
      parentId: number | null;
      imageId?: number | null;
      imageUrl?: string | null;
    }>(`/locations/${id}`);

    editingId.value = id;
    Object.assign(form, {
      name: location.name,
      description: location.description ?? '',
      parentId: location.parentId ?? undefined,
      imageIds: [],
    });
    initialImage.value = location.imageUrl ? [] : [];
  } catch (error) {
    toast.add({ title: (error as { message?: string }).message ?? t('errors.unknown'), color: 'error' });
    return;
  }
  formOpen.value = true;
}

async function save() {
  saving.value = true;
  try {
    const payload = {
      name: form.name,
      description: form.description || undefined,
      imageId: form.imageIds[0] ?? undefined,
    };

    if (editingId.value) {
      await api.patch(`/locations/${editingId.value}`, payload);
    } else {
      await api.post('/locations', {
        ...payload,
        parentId: form.parentId && form.parentId > 0 ? form.parentId : undefined,
      });
    }

    formOpen.value = false;
    toast.add({ title: t('common.saved'), color: 'success' });
    emit('saved');
  } catch (error) {
    toast.add({ title: (error as { message?: string }).message ?? t('errors.unknown'), color: 'error' });
  } finally {
    saving.value = false;
  }
}

async function removeEditing() {
  if (!editingId.value) return;
  if (!window.confirm(t('location.deleteConfirm', { name: form.name }))) return;

  try {
    await api.del(`/locations/${editingId.value}`);
    const removed = editingId.value;
    formOpen.value = false;
    toast.add({ title: t('common.deleted'), color: 'success' });
    emit('deleted', removed);
  } catch (error) {
    toast.add({ title: (error as { message?: string }).message ?? t('errors.unknown'), color: 'error' });
  }
}

async function openQr(id: number) {
  qrOpen.value = true;
  try {
    const svg = await api.request<string>(`/locations/${id}/qrcode.svg`, { responseType: 'text' });
    qrUrl.value = URL.createObjectURL(new Blob([svg as unknown as string], { type: 'image/svg+xml' }));
  } catch {
    qrUrl.value = '';
  }
}

defineExpose({ openCreate, openEdit, openQr });
</script>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100%;
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: 12px;
}

.push-end {
  margin-left: auto;
}

.fill-modal :deep([data-slot='body']) {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.fill-modal .form {
  flex: 1;
}

.qr-box {
  display: flex;
  justify-content: center;
}

.qr-box img {
  width: 240px;
  height: 240px;
}

@media (max-width: 767px) {
  .hide-sm {
    display: none;
  }
}
</style>
