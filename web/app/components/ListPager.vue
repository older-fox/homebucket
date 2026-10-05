<template>
  <div v-if="total > pageSize" class="hb-pager">
    <UButton color="neutral" variant="soft" size="sm" :disabled="page <= 1" @click="emit('update:page', page - 1)">
      {{ t('common.prev') }}
    </UButton>
    <span class="hb-muted hb-num">{{ page }} / {{ pages }}</span>
    <UButton color="neutral" variant="soft" size="sm" :disabled="page >= pages" @click="emit('update:page', page + 1)">
      {{ t('common.next') }}
    </UButton>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  page: number;
  total: number;
  pageSize: number;
}>();

const emit = defineEmits<{ 'update:page': [number] }>();

const { t } = useI18n();
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
</script>
