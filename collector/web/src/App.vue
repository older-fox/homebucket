<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import AdminTokenDialog from './components/AdminTokenDialog.vue';
import { api, errorMessage } from './api';
import type { HealthView } from './api';
import { loadToken, session } from './session';

const health = ref<HealthView | null>(null);
const healthError = ref('');
const showToken = ref(false);

async function refreshHealth(): Promise<void> {
  try {
    health.value = await api.health();
    healthError.value = '';
  } catch (error) {
    health.value = null;
    healthError.value = errorMessage(error);
  }
}

onMounted(() => {
  loadToken();
  void refreshHealth();
});
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <RouterLink to="/" class="brand">
        <span class="brand-mark">HB</span>
        <span>
          <strong>物品信息收集器</strong>
          <small>HomeBucket Collector</small>
        </span>
      </RouterLink>

      <nav class="nav">
        <RouterLink to="/">查条码</RouterLink>
        <RouterLink to="/stats">统计概览</RouterLink>
        <RouterLink to="/audit">上报审计</RouterLink>
        <RouterLink to="/admin">纠错台</RouterLink>
      </nav>

      <button class="btn ghost tiny" type="button" @click="showToken = true">
        <span class="chip" :class="session.token ? 'accent' : ''" style="margin-right: 2px">
          {{ session.token ? (session.verified ? '令牌已校验' : '令牌已保存') : '未填令牌' }}
        </span>
        管理令牌
      </button>
    </header>

    <main class="wrap">
      <RouterView />
    </main>

    <footer class="footer">
      <template v-if="health">
        <span>v{{ health.version }} · {{ health.storage.provider }}</span>
        <span>{{ health.storage.items }} 条资料 / {{ health.storage.contributions }} 次上报 / {{ health.storage.instances }} 个实例</span>
        <span class="chip" :class="health.registrationOpen ? 'ok' : 'warn'">
          {{ health.registrationOpen ? '实例注册开放' : '实例注册已关闭' }}
        </span>
        <span class="spacer" />
        <span class="mono tiny">{{ health.storage.dataFile }}</span>
      </template>
      <span v-else class="muted">{{ healthError || '服务端未就绪' }}</span>
    </footer>
  </div>

  <AdminTokenDialog v-if="showToken" @close="showToken = false" @verified="refreshHealth" />
</template>
