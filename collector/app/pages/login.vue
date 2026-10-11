<script setup lang="ts">
import { computed, ref } from 'vue';
import { navigateTo, useRoute } from '#imports';
import { toAdminSessionError, useAdminSession } from '../composables/useAdminSession';

/**
 * 登录页：账号 + 口令换一个 httpOnly 会话 cookie。
 * 服务端成功时会 Set-Cookie，前端拿不到也存不了任何令牌 —— 这里只把 user 状态同步好。
 */
const route = useRoute();
const { login } = useAdminSession();

const username = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

/** ?redirect= 只接受站内路径：必须 "/" 开头且不能是 "//host"（否则就是开放重定向）。 */
const redirectTo = computed(() => {
  const raw = route.query.redirect;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) return value;
  return '/admin';
});

function errorText(caught: unknown): string {
  const parsed = toAdminSessionError(caught);
  if (parsed.code === 'admin.badCredentials') return '用户名或密码不正确';
  if (parsed.code === 'rate.tooMany') return `尝试过于频繁，请 ${parsed.retryAfterSeconds ?? 60} 秒后重试`;
  if (parsed.code === 'validation.failed') return parsed.message || '输入不合法';
  if (parsed.status === 0) return '连不上收集器服务，检查它是否在运行';
  return parsed.message;
}

async function submit(): Promise<void> {
  if (busy.value) return;
  error.value = '';
  busy.value = true;
  try {
    await login(username.value.trim(), password.value);
    await navigateTo(redirectTo.value);
  } catch (caught) {
    error.value = errorText(caught);
  } finally {
    busy.value = false;
  }
}

useHead({ title: '登录' });

const card = 'mx-auto mt-6 w-full max-w-[420px] rounded-[10px] border border-slate-200 bg-white p-[22px] shadow-sm dark:border-slate-800 dark:bg-slate-900';
const input =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-brand-700/40';
const label = 'mb-1 block text-[12.5px] text-slate-500 dark:text-slate-400';
const primaryButton =
  'w-full rounded-lg bg-brand-600 px-3.5 py-2 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50';
const errorNotice =
  'mt-3 rounded-lg border border-red-500/30 bg-red-50 px-3 py-2.5 text-[13.5px] text-red-700 dark:bg-red-500/10 dark:text-red-300';
</script>

<template>
  <div data-testid="page-head" class="mx-auto w-full max-w-[420px]">
    <h1 class="m-0 text-2xl font-bold">登录</h1>
  </div>

  <form :class="card" data-testid="login-form" @submit.prevent="submit">
    <p class="m-0 mb-4 text-[13.5px] text-slate-500 dark:text-slate-400">
      纠错台、上报审计与改密码需要管理员账号。登录状态保存在服务端的 httpOnly cookie 里，浏览器脚本读不到它。
    </p>

    <label class="mb-3 block">
      <span :class="label">账号</span>
      <input
        v-model="username"
        :class="input"
        data-testid="login-username"
        name="username"
        type="text"
        autocomplete="username"
        placeholder="admin"
        autofocus
      />
    </label>

    <label class="mb-3 block">
      <span :class="label">口令</span>
      <input
        v-model="password"
        :class="input"
        data-testid="login-password"
        name="password"
        type="password"
        autocomplete="current-password"
        placeholder="口令"
      />
    </label>

    <button :class="primaryButton" data-testid="login-submit" type="submit" :disabled="busy">
      {{ busy ? '登录中…' : '登录' }}
    </button>

    <p v-if="error" :class="errorNotice" data-testid="login-error">{{ error }}</p>

    <p class="mt-3 mb-0 text-[12.5px] text-slate-500 dark:text-slate-400">
      开发默认：账号 <code class="font-mono">admin</code>（口令由服务端的
      <code class="font-mono">COLLECTOR_ADMIN_PASSWORD</code> 决定）。
    </p>
  </form>
</template>
