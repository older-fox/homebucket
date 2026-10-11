<script setup lang="ts">
import { ref } from 'vue';
import { api, errorMessage } from '../api';
import { saveToken, session } from '../session';

const emit = defineEmits<{ (e: 'close'): void; (e: 'verified'): void }>();

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
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="dialog">
      <h2>管理令牌</h2>
      <p class="small muted">
        纠错台的动作（改字段、屏蔽上报、合并条目、封禁实例）都要带这个令牌，它对应服务端的
        <code>COLLECTOR_ADMIN_TOKEN</code>。令牌只存在这个浏览器本地，不会发给别的站点。
      </p>
      <label class="field">
        <span>令牌</span>
        <input v-model="draft" class="input" type="password" placeholder="服务端的 COLLECTOR_ADMIN_TOKEN" @keyup.enter="verify" />
      </label>
      <p v-if="error" class="notice error small" style="margin-top: 10px">{{ error }}</p>
      <p v-else-if="ok" class="notice ok small" style="margin-top: 10px">{{ ok }}</p>
      <div class="row" style="margin-top: 14px">
        <button class="btn" type="button" :disabled="busy || !draft.trim()" @click="verify">
          {{ busy ? '校验中…' : '保存并校验' }}
        </button>
        <button class="btn subtle" type="button" @click="clear">清除</button>
        <span class="spacer" />
        <button class="btn ghost" type="button" @click="emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>
