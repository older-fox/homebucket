<template>
  <div class="tag-picker">
    <div class="chips">
      <button
        v-for="tag in tags"
        :key="tag.id"
        type="button"
        class="chip hb-tap"
        :class="{ active: modelValue.includes(tag.id) }"
        :style="
          modelValue.includes(tag.id)
            ? { background: tag.color, borderColor: tag.color, color: '#fff' }
            : { borderColor: `color-mix(in srgb, ${tag.color} 45%, var(--hb-border))`, color: 'var(--hb-text)' }
        "
        @click="toggle(tag.id)"
      >
        <span class="dot" :style="{ background: modelValue.includes(tag.id) ? '#fff' : tag.color }" />
        {{ tag.name }}
      </button>

      <!-- 内联新建：不弹窗、不打断输入流 -->
      <div v-if="creating" class="creator">
        <button type="button" class="swatch" :style="{ background: draftColor }" @click="cycleColor" />
        <input
          ref="input"
          v-model="draftName"
          class="creator-input"
          :placeholder="t('item.newTagName')"
          maxlength="40"
          @keydown.enter.prevent="submit"
          @keydown.esc.prevent="cancel"
        />
        <button type="button" class="creator-btn ok" :disabled="saving" @click="submit">
          <UIcon :name="saving ? 'i-lucide-loader-circle' : 'i-lucide-check'" :class="{ spin: saving }" />
        </button>
        <button type="button" class="creator-btn" @click="cancel">
          <UIcon name="i-lucide-x" />
        </button>
      </div>

      <button v-else-if="allowCreate" type="button" class="chip add hb-tap" @click="startCreate">
        <UIcon name="i-lucide-plus" />
        {{ t('common.add') }}
      </button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
interface Tag {
  id: number;
  name: string;
  color: string;
}

const props = withDefaults(defineProps<{ modelValue: number[]; allowCreate?: boolean }>(), {
  allowCreate: true,
});

const emit = defineEmits<{ 'update:modelValue': [number[]] }>();

const { t } = useI18n();
const api = useApi();

const PALETTE = ['#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#64748b', '#ef4444'];

const tags = ref<Tag[]>([]);
const creating = ref(false);
const saving = ref(false);
const error = ref('');
const draftName = ref('');
const colorIndex = ref(0);
const input = ref<HTMLInputElement>();

const draftColor = computed(() => PALETTE[colorIndex.value % PALETTE.length]);

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

/** 内联创建：点色块循环换色，回车提交，Esc 取消 */
async function startCreate() {
  error.value = '';
  draftName.value = '';
  colorIndex.value = tags.value.length % PALETTE.length;
  creating.value = true;
  await nextTick();
  input.value?.focus();
}

function cancel() {
  creating.value = false;
  draftName.value = '';
  error.value = '';
}

function cycleColor() {
  colorIndex.value = (colorIndex.value + 1) % PALETTE.length;
}

async function submit() {
  const name = draftName.value.trim();
  if (!name || saving.value) return;

  saving.value = true;
  error.value = '';
  try {
    const tag = await api.post<Tag>('/tags', { name, color: draftColor.value });
    tags.value.push(tag);
    emit('update:modelValue', [...props.modelValue, tag.id]);
    creating.value = false;
    draftName.value = '';
  } catch (e) {
    error.value = (e as { message?: string }).message ?? t('errors.unknown');
  } finally {
    saving.value = false;
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 5px 12px;
  border-radius: var(--hb-r-full);
  border: 1.5px solid var(--hb-border);
  background: var(--hb-surface);
  color: var(--hb-text-2);
  font-size: var(--hb-fs-sm);
  font-weight: var(--hb-fw-medium);
  cursor: pointer;
  transition:
    background var(--hb-dur) var(--hb-ease),
    border-color var(--hb-dur) var(--hb-ease);
}

.chip:hover {
  border-color: var(--hb-border-strong);
}

.chip.active {
  font-weight: var(--hb-fw-semibold);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.chip.add {
  border-style: dashed;
  color: var(--hb-brand);
  border-color: color-mix(in srgb, var(--hb-brand) 40%, var(--hb-border));
}

.chip.add :deep(svg) {
  width: 15px;
  height: 15px;
}

.creator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 4px 8px;
  border-radius: var(--hb-r-full);
  border: 1.5px solid var(--hb-brand);
  background: var(--hb-surface);
  box-shadow: 0 0 0 4px var(--hb-brand-soft);
}

.swatch {
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
}

.creator-input {
  width: 132px;
  min-width: 90px;
  border: 0;
  background: transparent;
  color: var(--hb-text);
  font-size: var(--hb-fs-sm);
  outline: none;
}

.creator-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--hb-muted);
  cursor: pointer;
}

.creator-btn:hover {
  background: var(--hb-surface-2);
  color: var(--hb-text);
}

.creator-btn.ok {
  background: var(--hb-brand);
  color: #fff;
}

.creator-btn.ok:disabled {
  opacity: 0.6;
  cursor: default;
}

.creator-btn :deep(svg) {
  width: 16px;
  height: 16px;
}

.spin {
  animation: hb-spin 0.9s linear infinite;
}

@keyframes hb-spin {
  to {
    transform: rotate(360deg);
  }
}

.error {
  margin: 8px 0 0;
  color: var(--hb-danger);
  font-size: var(--hb-fs-sm);
}
</style>
