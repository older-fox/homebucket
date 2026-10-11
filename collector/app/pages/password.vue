<script setup lang="ts">
import { ref } from 'vue';
import { toAdminSessionError, useAdminSession } from '../composables/useAdminSession';

/** 页面由 admin-auth 中间件保护（未登录会被送回 /login?redirect=/password）。 */
definePageMeta({ middleware: 'admin-auth' });

const { changePassword } = useAdminSession();

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
      return '当前密码不正确';
    case 'admin.passwordUnchanged':
      return '新密码不能与当前密码相同';
    case 'validation.failed':
      return parsed.message || '新密码长度至少 8 位';
    default:
      if (parsed.status === 0) return '连不上收集器服务，检查它是否在运行';
      return parsed.message;
  }
}

/** 三项校验全在客户端做，服务端仍会再校验一遍（这里是体验，不是安全边界）。 */
function localError(): string {
  if (!current.value) return '请输入当前密码';
  if (next.value.length < 8) return '新密码长度至少 8 位';
  if (next.value !== confirm.value) return '两次输入的新密码不一致';
  if (next.value === current.value) return '新密码不能与当前密码相同';
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
        ? `密码已更新，其它设备上的登录已失效（吊销 ${result.revokedSessions} 个会话）`
        : '密码已更新';
    current.value = '';
    next.value = '';
    confirm.value = '';
  } catch (caught) {
    error.value = errorText(caught);
  } finally {
    busy.value = false;
  }
}

useHead({ title: '修改密码' });

const card = 'mx-auto mt-6 w-full max-w-[440px] rounded-[10px] border border-slate-200 bg-white p-[22px] shadow-sm dark:border-slate-800 dark:bg-slate-900';
const input =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-brand-700/40';
const label = 'mb-1 block text-[12.5px] text-slate-500 dark:text-slate-400';
const primaryButton =
  'w-full rounded-lg bg-brand-600 px-3.5 py-2 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50';
const errorNotice =
  'mt-3 rounded-lg border border-red-500/30 bg-red-50 px-3 py-2.5 text-[13.5px] text-red-700 dark:bg-red-500/10 dark:text-red-300';
const okNotice =
  'mt-3 rounded-lg border border-emerald-500/30 bg-emerald-50 px-3 py-2.5 text-[13.5px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
</script>

<template>
  <div data-testid="page-head" class="mx-auto w-full max-w-[440px]">
    <h1 class="m-0 text-2xl font-bold">修改密码</h1>
    <p class="mt-1 mb-0 text-[13.5px] text-slate-500 dark:text-slate-400">
      改成功后其它设备上的会话会被吊销，当前浏览器保持登录。
    </p>
  </div>

  <form :class="card" data-testid="password-form" @submit.prevent="submit">
    <label class="mb-3 block">
      <span :class="label">当前密码</span>
      <input
        v-model="current"
        :class="input"
        data-testid="password-current"
        name="current-password"
        type="password"
        autocomplete="current-password"
      />
    </label>

    <label class="mb-3 block">
      <span :class="label">新密码（至少 8 位）</span>
      <input
        v-model="next"
        :class="input"
        data-testid="password-new"
        name="new-password"
        type="password"
        autocomplete="new-password"
      />
    </label>

    <label class="mb-3 block">
      <span :class="label">确认新密码</span>
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
      {{ busy ? '提交中…' : '更新密码' }}
    </button>

    <p v-if="error" :class="errorNotice" data-testid="password-error">{{ error }}</p>
    <p v-if="notice" :class="okNotice" data-testid="password-notice">{{ notice }}</p>
  </form>
</template>
