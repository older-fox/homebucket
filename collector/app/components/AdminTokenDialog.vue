<script setup lang="ts">
import { ref } from 'vue';
import { errorMessage, useApi } from '../composables/useApi';
import { saveToken, session } from '../composables/useAdminToken';

const emit = defineEmits<{ (e: 'close'): void; (e: 'verified'): void }>();

const api = useApi();
const draft = ref(session.token);
const error = ref('');
const ok = ref('');
const busy = ref(false);

async function verify(): Promise<void> {
  busy.value = true;
  error.value = '';
  ok.value = '';
  saveToken(draft.value);
  try {
    const info = await api.admin.session();
    session.verified = true;
    ok.value = `令牌有效（scope=${info.scope}，服务端 v${info.version}）`;
    emit('verified');
  } catch (caught) {
    session.verified = false;
    error.value = errorMessage(caught);
  } finally {
    busy.value = false;
  }
}

function clear(): void {
  saveToken('');
  draft.value = '';
  session.verified = false;
  ok.value = '已清除本地令牌';
  error.value = '';
}

const input =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-brand-700/40';
const primaryButton =
  'inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50';
const subtleButton =
  'inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3.5 py-2 font-medium text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700';
const ghostButton =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800';
const errorNotice =
  'mt-2.5 rounded-lg border border-red-500/30 bg-red-50 px-3 py-2.5 text-[13.5px] text-red-700 dark:bg-red-500/10 dark:text-red-300';
const okNotice =
  'mt-2.5 rounded-lg border border-emerald-500/30 bg-emerald-50 px-3 py-2.5 text-[13.5px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
</script>

<template>
  <div
    class="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-5"
    data-testid="token-overlay"
    @click.self="emit('close')"
  >
    <div
      data-testid="token-dialog"
      class="w-full max-w-[460px] rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 class="mt-0 mb-3 text-base font-semibold">管理令牌</h2>
      <p class="m-0 text-[13px] text-slate-500 dark:text-slate-400">
        纠错台的动作（改字段、屏蔽上报、合并条目、封禁实例）都要带这个令牌，它对应服务端的
        <code class="font-mono">COLLECTOR_ADMIN_TOKEN</code>。令牌只存在这个浏览器本地，不会发给别的站点。
      </p>
      <label class="mt-3 block">
        <span class="mb-1 block text-[12.5px] text-slate-500 dark:text-slate-400">令牌</span>
        <input
          v-model="draft"
          :class="input"
          data-testid="token-input"
          type="password"
          placeholder="服务端的 COLLECTOR_ADMIN_TOKEN"
          @keyup.enter="verify"
        />
      </label>
      <p v-if="error" :class="errorNotice" data-testid="notice">{{ error }}</p>
      <p v-else-if="ok" :class="okNotice" data-testid="notice">{{ ok }}</p>
      <div class="mt-3.5 flex flex-wrap items-center gap-2.5">
        <button
          :class="primaryButton"
          data-testid="token-save"
          type="button"
          :disabled="busy || !draft.trim()"
          @click="verify"
        >
          {{ busy ? '校验中…' : '保存并校验' }}
        </button>
        <button :class="subtleButton" data-testid="token-clear" type="button" @click="clear">清除</button>
        <span class="flex-1" />
        <button :class="ghostButton" data-testid="token-close" type="button" @click="emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>
