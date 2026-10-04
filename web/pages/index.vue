<template>
  <section>
    <h1>我的收纳空间</h1>

    <div v-if="user" class="card">
      <p>
        已登录：<strong>{{ user.username }}</strong>（{{ user.email }}）
      </p>
      <p class="muted">后端状态：{{ health?.status ?? '未知' }} / db: {{ health?.db ?? '-' }}</p>
      <button type="button" @click="logout">退出登录</button>
    </div>

    <div v-else class="card">
      <p>还没有登录，登录后可以开始记录物品的收纳位置。</p>
      <div class="actions">
        <NuxtLink to="/login" class="btn">登录</NuxtLink>
        <NuxtLink to="/register" class="btn btn-ghost">注册</NuxtLink>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const { public: pub } = useRuntimeConfig();
const { user, token, fetchMe, logout } = useAuth();

const { data: health } = await useFetch<{ status: string; db: boolean }>('/health', {
  baseURL: pub.apiBase,
  server: false,
});

// 刷新页面后 token 还在 cookie 里，用它换回用户信息
if (token.value && !user.value) {
  await fetchMe();
}
</script>

<style scoped>
h1 {
  margin-top: 0;
}

.card {
  background: #fff;
  border: 1px solid #e6ebe9;
  border-radius: 10px;
  padding: 18px 20px;
}

.muted {
  color: #6b7a76;
  font-size: 13px;
}

.actions {
  display: flex;
  gap: 10px;
}

.btn {
  display: inline-block;
  padding: 8px 16px;
  border-radius: 8px;
  background: var(--hb-primary);
  color: #fff;
  text-decoration: none;
}

.btn-ghost {
  background: transparent;
  color: var(--hb-primary);
  border: 1px solid var(--hb-primary);
}

button {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid #cfd8d5;
  background: #fff;
  cursor: pointer;
}
</style>
