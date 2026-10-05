<template>
  <div class="uploader">
    <div v-if="previews.length" class="grid">
      <div v-for="(item, index) in previews" :key="item.id" class="thumb">
        <img :src="item.url" :alt="item.name" />
        <button type="button" class="remove" :aria-label="t('common.remove')" @click="remove(index)">
          <UIcon name="i-lucide-x" />
        </button>
      </div>
    </div>

    <label class="picker hb-tap">
      <UIcon name="i-lucide-image-plus" class="picker-icon" />
      <span>{{ uploading ? t('common.loading') : t('item.images') }}</span>
      <input
        ref="input"
        type="file"
        accept="image/*"
        :multiple="multiple"
        :capture="capture"
        hidden
        @change="onSelect"
      />
    </label>

    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * 照片上传：上传后把 attachment id 通过 v-model 抛给表单，预览用后端返回的 url。
 * 多个组件共用，保持统一的移动端体验（相册 / 拍照 capture）。
 */
const props = withDefaults(
  defineProps<{
    modelValue: number[];
    /** 已有的图片（编辑场景回显），格式 [{ id, url }] */
    initial?: { id: number; url: string }[];
    multiple?: boolean;
    capture?: 'environment' | 'user' | undefined;
  }>(),
  { initial: () => [], multiple: true, capture: 'environment' },
);

const emit = defineEmits<{ 'update:modelValue': [number[]]; uploaded: [{ id: number; url: string }] }>();

const { t } = useI18n();
const api = useApi();

const input = ref<HTMLInputElement>();
const uploading = ref(false);
const error = ref('');
const previews = ref<{ id: number; url: string; name?: string }[]>([...props.initial]);

async function onSelect(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files ?? []);
  if (!files.length) return;

  error.value = '';
  uploading.value = true;
  try {
    const uploaded: { id: number; url: string; name?: string }[] = [];
    for (const file of props.multiple ? files : files.slice(0, 1)) {
      const form = new FormData();
      form.append('file', file);
      const result = await api.request<{ id: number; url: string }>('/uploads', {
        method: 'POST',
        body: form,
      });
      uploaded.push({ id: result.id, url: result.url, name: file.name });
      emit('uploaded', { id: result.id, url: result.url });
    }

    previews.value = props.multiple ? [...previews.value, ...uploaded] : uploaded;
    emit(
      'update:modelValue',
      previews.value.map((item) => item.id),
    );
  } catch (e) {
    error.value = (e as { message?: string }).message ?? t('errors.unknown');
  } finally {
    uploading.value = false;
    if (input.value) input.value.value = '';
  }
}

function remove(index: number) {
  previews.value.splice(index, 1);
  emit(
    'update:modelValue',
    previews.value.map((item) => item.id),
  );
}

watch(
  () => props.initial,
  (value) => {
    if (value?.length) previews.value = [...value];
  },
);
</script>

<style scoped>
.uploader {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 8px;
}

.thumb {
  position: relative;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--hb-border);
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.picker {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 76px;
  border: 1px dashed var(--hb-border-strong);
  border-radius: 12px;
  color: var(--hb-muted);
  font-size: var(--hb-fs-sm);
  cursor: pointer;
}

.picker:hover {
  border-color: var(--hb-brand);
  color: var(--hb-brand);
}

.picker-icon {
  width: 20px;
  height: 20px;
}

.error {
  margin: 0;
  color: var(--hb-danger);
  font-size: var(--hb-fs-sm);
}
</style>
