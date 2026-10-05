<template>
  <div class="tag-picker">
    <div class="chips">
      <button
        v-for="tag in tags"
        :key="tag.id"
        type="button"
        class="chip hb-tap"
        :class="{ active: modelValue.includes(tag.id) }"
        :style="modelValue.includes(tag.id) ? { background: tag.color, borderColor: tag.color } : { borderColor: tag.color, color: tag.color }"
        @click="toggle(tag.id)"
      >
        {{ tag.name }}
      </button>
      <UButton
        size="xs"
        color="neutral"
        variant="soft"
        icon="i-lucide-plus"
        :loading="creating"
        @click="createTag"
      >
        {{ t('common.add') }}
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Tag {
  id: number;
  name: string;
  color: string;
}

const props = defineProps<{ modelValue: number[] }>();
const emit = defineEmits<{ 'update:modelValue': [number[]] }>();

const { t } = useI18n();
const api = useApi();
const toast = useToast();

const tags = ref<Tag[]>([]);
const creating = ref(false);

onMounted(load);

async function load() {
  try {
    tags.value = await api.get<Tag[]>('/tags');
  } catch {
    tags.value = [];
  }
}

function toggle(id: number) {
  const next = props.modelValue.includes(id)
    ? props.modelValue.filter((item) => item !== id)
    : [...props.modelValue, id];
  emit('update:modelValue', next);
}

async function createTag() {
  const name = window.prompt(t('item.tags'));
  if (!name?.trim()) return;
  creating.value = true;
  try {
    const tag = await api.post<Tag>('/tags', { name: name.trim() });
    tags.value.push(tag);
    emit('update:modelValue', [...props.modelValue, tag.id]);
  } catch (error) {
    toast.add({ title: (error as { message?: string }).message ?? t('errors.unknown'), color: 'error' });
  } finally {
    creating.value = false;
  }
}
</script>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.chip {
  min-height: 34px;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1.5px solid;
  background: var(--hb-surface);
  font-size: var(--hb-fs-sm);
  color: var(--hb-text-2);
}

.chip.active {
  color: #fff;
  font-weight: var(--hb-fw-semibold);
}
</style>
