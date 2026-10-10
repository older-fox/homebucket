<template>
  <div class="uq">
    <template v-if="packaged">
      <div class="uq-row">
        <label v-for="field in fields" :key="field.key" class="uq-field">
          <span class="uq-label">{{ field.label }}</span>
          <UInput
            :model-value="counts[field.key] ?? 0"
            type="number"
            min="0"
            inputmode="numeric"
            @update:model-value="(value) => setCount(field.key, value)"
          />
        </label>
      </div>
      <p class="uq-total hb-muted">{{ t('item.packTotal') }} {{ totalText }}</p>
    </template>

    <UInput
      v-else
      :model-value="modelValue"
      type="number"
      min="0"
      inputmode="numeric"
      @update:model-value="(value) => emit('update:modelValue', toInt(value))"
    />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  /** 最小单位总数 */
  modelValue: number;
  baseUnit?: string | null;
  packLevels?: unknown;
}>();

const emit = defineEmits<{ 'update:modelValue': [number] }>();

const { t } = useI18n();
const { levels, hasPackaging, decompose, compose } = useUnits();

const BASE_KEY = '__base';

const packaged = computed(() => hasPackaging(props.baseUnit, props.packLevels));
const list = computed(() => levels(props.packLevels));

/** 输入项：各包装层级（从大到小）+ 最小单位 */
const fields = computed(() => [
  ...list.value.map((level) => ({ key: level.name, label: level.name })),
  { key: BASE_KEY, label: props.baseUnit || t('item.baseUnit') },
]);

const counts = reactive<Record<string, number>>({});
/** 标记"这次 modelValue 变化是我们自己 emit 出去的"，避免回填时打断输入 */
let internal = false;

function toInt(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function sync() {
  const { parts, base } = decompose(props.modelValue, list.value);
  for (const key of Object.keys(counts)) delete counts[key];
  for (const part of parts) counts[part.name] = part.count;
  counts[BASE_KEY] = base;
}

function currentTotal(): number {
  return compose(counts, counts[BASE_KEY] ?? 0, list.value);
}

function setCount(key: string, value: unknown) {
  counts[key] = toInt(value);
  internal = true;
  emit('update:modelValue', currentTotal());
  void nextTick(() => {
    internal = false;
  });
}

const totalText = computed(() => `${currentTotal()}${props.baseUnit ?? ''}`);

watch(
  () => props.modelValue,
  () => {
    if (!internal) sync();
  },
);
watch(() => [props.baseUnit, props.packLevels], sync, { deep: true });
onMounted(sync);
</script>

<style scoped>
.uq {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.uq-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.uq-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 84px;
  flex: 1;
}

.uq-label {
  font-size: var(--hb-fs-xs);
  color: var(--hb-muted);
}

.uq-total {
  margin: 0;
  font-size: var(--hb-fs-xs);
}
</style>
