<script setup lang="ts">
import { computed, ref } from 'vue';
import { toAdminSessionError, useAdminSession } from '../composables/useAdminSession';

/**
 * 页面受全局中间件 `login-gate` 与 `useAuthGate` 保护（未登录会被送回 /login?redirect=/password）。
 *
 * 布局同样是认证单页：改密码和登录一样是"身份还没确认完"的场景，
 * 把它塞回带侧栏的应用外壳里会让用户以为已经进了管理台、其实只是换个口令。
 */
definePageMeta({ layout: 'auth' });

const { changePassword } = useAdminSession();
const { t } = useI18n();

const current = ref('');
const next = ref('');
const confirm = ref('');
const error = ref('');
const notice = ref('');
const busy = ref(false);

function errorText(caught: unknown): string {
  const parsed = toAdminSessionError(caught);
  switch (parsed.code) {
    case 'admin.badCurrentPassword':
      return t('auth.password.badCurrent');
    case 'admin.passwordUnchanged':
      return t('auth.password.unchanged');
    case 'validation.failed':
      return parsed.message || t('auth.password.newTooShort');
    default:
      if (parsed.status === 0) return t('auth.serviceUnreachable');
      return parsed.message;
  }
}

/** 三项校验全在客户端做，服务端仍会再校验一遍（这里是体验，不是安全边界）。 */
function localError(): string {
  if (!current.value) return t('auth.password.currentRequired');
  if (next.value.length < 8) return t('auth.password.newTooShort');
  if (next.value !== confirm.value) return t('auth.password.mismatch');
  if (next.value === current.value) return t('auth.password.sameAsCurrent');
  return '';
}

async function submit(): Promise<void> {
  if (busy.value) return;
  error.value = '';
  notice.value = '';
  const invalid = localError();
  if (invalid) {
    error.value = invalid;
    return;
  }
  busy.value = true;
  try {
    const result = await changePassword(current.value, next.value);
    // 只在真的踢掉了别的会话时才提"其它设备"：吊销 0 个会话却说它们失效了，是句假话。
    notice.value =
      result.revokedSessions > 0
        ? t('auth.password.updatedRevoked', { count: result.revokedSessions })
        : t('auth.password.updated');
    current.value = '';
    next.value = '';
    confirm.value = '';
  } catch (caught) {
    error.value = errorText(caught);
  } finally {
    busy.value = false;
  }
}

useHead({ title: computed(() => t('auth.passwordTitle')) });

/**
 * 认证卡片的规格面（§6.8）：半透明 + 毛玻璃 + 深阴影 + 一圈细环。
 * 与登录页同一形状，两张认证页视觉上必须是一族。
 */
const card =
  'rounded-2xl bg-white/90 p-6 shadow-xl shadow-gray-900/5 ring-1 ring-gray-200/80 backdrop-blur-sm sm:p-8 dark:bg-gray-900/80 dark:ring-gray-800 dark:shadow-black/40';
</script>

<template>
  <div class="w-full max-w-md">
    <!-- 品牌头与登录页同一形状（规范 §6.8）：两张认证页视觉上必须是同一族 -->
    <div data-testid="page-head" class="mb-6 flex flex-col items-center gap-2 text-center">
      <span
        class="grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-lg font-bold tracking-wide text-white shadow-md shadow-blue-600/25"
      >
        {{ t('brand.mark') }}
      </span>
      <h1 class="m-0 text-2xl font-semibold tracking-tight">{{ t('brand.name') }}</h1>
      <p class="m-0 max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">{{ t('brand.tagline') }}</p>
    </div>

    <form :class="card" data-testid="password-form" @submit.prevent="submit">
      <UFormField :label="t('auth.password.currentLabel')" class="mb-4">
        <UInput
          v-model="current"
          data-testid="password-current"
          name="current-password"
          type="password"
          autocomplete="current-password"
          required
          size="lg"
          class="w-full"
        >
          <template #leading>
            <AppIcon name="lock" class="h-[18px] w-[18px] text-gray-400 dark:text-gray-500" />
          </template>
        </UInput>
      </UFormField>

      <UFormField :label="t('auth.password.newLabel')" class="mb-4">
        <UInput
          v-model="next"
          data-testid="password-new"
          name="new-password"
          type="password"
          autocomplete="new-password"
          required
          size="lg"
          class="w-full"
          :placeholder="t('auth.password.newPlaceholder')"
        >
          <template #leading>
            <AppIcon name="key" class="h-[18px] w-[18px] text-gray-400 dark:text-gray-500" />
          </template>
        </UInput>
      </UFormField>

      <UFormField :label="t('auth.password.confirmLabel')" class="mb-4">
        <UInput
          v-model="confirm"
          data-testid="password-confirm"
          name="confirm-password"
          type="password"
          autocomplete="new-password"
          required
          size="lg"
          class="w-full"
        >
          <template #leading>
            <AppIcon name="key" class="h-[18px] w-[18px] text-gray-400 dark:text-gray-500" />
          </template>
        </UInput>
      </UFormField>

      <UButton type="submit" color="primary" size="lg" block :loading="busy" data-testid="password-submit">
        {{ busy ? t('auth.password.submitting') : t('auth.password.submit') }}
      </UButton>

      <AppNotice v-if="error" tone="error" class="mt-4" data-testid="password-error">{{ error }}</AppNotice>
      <AppNotice v-if="notice" tone="success" class="mt-4" data-testid="password-notice">{{ notice }}</AppNotice>
    </form>

    <p class="mt-5 mb-0 text-center text-sm">
      <NuxtLink
        to="/admin"
        data-testid="password-back"
        class="rounded font-medium text-blue-700 transition-colors duration-150 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
      >
        {{ t('auth.password.back') }}
      </NuxtLink>
    </p>
  </div>
</template>
