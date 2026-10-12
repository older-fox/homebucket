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

const input =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 transition-colors duration-150 outline-none placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500';
const label = 'mb-1.5 block text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400';
const primaryButton =
  'flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-gray-950';
const card =
  'mt-6 rounded-2xl border border-gray-200 bg-white/90 p-6 shadow-xl shadow-gray-900/5 backdrop-blur-sm sm:p-8 dark:border-gray-800 dark:bg-gray-900/80 dark:shadow-black/40';
const errorNotice = 'mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400';
const okNotice = 'mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400';
</script>

<template>
  <div class="w-full max-w-md">
    <!-- 品牌头与登录页同一形状（规范 §6.8）：两张认证页视觉上必须是同一族 -->
    <div data-testid="page-head" class="mb-6 flex flex-col items-center gap-2 text-center">
      <span
        class="grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-lg font-bold tracking-wide text-white shadow-md shadow-blue-600/25"
      >
        HB
      </span>
      <h1 class="m-0 text-2xl font-semibold tracking-tight">{{ t('auth.passwordTitle') }}</h1>
      <p class="m-0 max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">{{ t('auth.passwordIntro') }}</p>
    </div>

    <form :class="card" data-testid="password-form" @submit.prevent="submit">
      <label class="mb-4 block">
        <span :class="label">{{ t('auth.password.currentLabel') }}</span>
        <input
          v-model="current"
          :class="input"
          data-testid="password-current"
          name="current-password"
          type="password"
          autocomplete="current-password"
        />
      </label>

      <label class="mb-4 block">
        <span :class="label">{{ t('auth.password.newLabel') }}</span>
        <input
          v-model="next"
          :class="input"
          data-testid="password-new"
          name="new-password"
          type="password"
          autocomplete="new-password"
        />
      </label>

      <label class="mb-4 block">
        <span :class="label">{{ t('auth.password.confirmLabel') }}</span>
        <input
          v-model="confirm"
          :class="input"
          data-testid="password-confirm"
          name="confirm-password"
          type="password"
          autocomplete="new-password"
        />
      </label>

      <button :class="primaryButton" data-testid="password-submit" type="submit" :disabled="busy">
        {{ busy ? t('auth.password.submitting') : t('auth.password.submit') }}
      </button>

      <p v-if="error" :class="errorNotice" data-testid="password-error">
        <AppIcon name="alert" class="mt-0.5 h-4 w-4 shrink-0" />
        <span>{{ error }}</span>
      </p>
      <p v-if="notice" :class="okNotice" data-testid="password-notice">
        <AppIcon name="check" class="mt-0.5 h-4 w-4 shrink-0" />
        <span>{{ notice }}</span>
      </p>
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
