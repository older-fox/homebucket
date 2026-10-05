<template>
  <USelect
    :model-value="modelValue ?? EMPTY"
    :items="options"
    :placeholder="placeholder ?? t('item.location')"
    class="w-full"
    size="xl"
    @update:model-value="onChange"
  />
</template>

<script setup lang="ts">
interface TreeNode {
  id: number;
  name: string;
  children: TreeNode[];
}

const props = withDefaults(
  defineProps<{ modelValue: number | null; placeholder?: string; allowEmpty?: boolean }>(),
  { placeholder: undefined, allowEmpty: true },
);
const emit = defineEmits<{ 'update:modelValue': [number | null] }>();

const { t } = useI18n();
const api = useApi();

const EMPTY = -1;
const options = ref<{ label: string; value: number }[]>([]);

function flatten(nodes: TreeNode[], depth = 0): { label: string; value: number }[] {
  return nodes.flatMap((node) => [
    { label: `${'　'.repeat(depth)}${depth ? '└ ' : ''}${node.name}`, value: node.id },
    ...flatten(node.children ?? [], depth + 1),
  ]);
}

onMounted(async () => {
  try {
    const tree = await api.get<TreeNode[]>('/locations/tree');
    options.value = [
      ...(props.allowEmpty ? [{ label: t('item.noLocation'), value: EMPTY }] : []),
      ...flatten(tree),
    ];
  } catch {
    options.value = props.allowEmpty ? [{ label: t('item.noLocation'), value: EMPTY }] : [];
  }
});

function onChange(value: number) {
  emit('update:modelValue', value === EMPTY ? null : value);
}
</script>
