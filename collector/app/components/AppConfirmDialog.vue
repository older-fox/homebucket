<script setup lang="ts">
/**
 * 确认对话框本体（常驻一份，见 `useConfirm`）。由 `confirmState` 驱动，自身不含业务。
 */
import { confirmState, settleConfirm } from '../composables/useConfirm';

const { t } = useI18n();

/** UModal 的 v-model:open：关闭（Esc / 点遮罩 / 关闭按钮）一律按“取消”落定。 */
const open = computed({
  get: () => confirmState.open,
  set: (value: boolean) => {
    if (!value) settleConfirm(false);
  },
});
</script>

<template>
  <UModal v-model:open="open" :title="confirmState.options?.title ?? t('confirm.title')">
    <template #body>
      <p class="m-0 text-sm leading-6 text-gray-600 dark:text-gray-300">
        {{ confirmState.options?.message }}
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" @click="settleConfirm(false)">
          {{ t('common.cancel') }}
        </UButton>
        <UButton :color="confirmState.options?.tone ?? 'primary'" @click="settleConfirm(true)">
          {{ confirmState.options?.confirmLabel ?? t('common.confirm') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
