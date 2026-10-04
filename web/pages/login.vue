<template>
  <section>
    <h1>登录</h1>

    <form class="card" @submit.prevent="submit">
      <label>
        邮箱
        <input v-model="form.email" type="email" autocomplete="email" required />
      </label>
      <label>
        密码
        <input v-model="form.password" type="password" autocomplete="current-password" required />
      </label>

      <p v-if="error" class="error">{{ error }}</p>

      <button type="submit" :disabled="loading">{{ loading ? '登录中…' : '登录' }}</button>
      <p class="muted">还没有账号？<NuxtLink to="/register">去注册</NuxtLink></p>
    </form>
  </section>
</template>

<script setup lang="ts">
const { login } = useAuth();

const form = reactive({ email: '', password: '' });
const loading = ref(false);
const error = ref('');

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    await login({ email: form.email, password: form.password });
  } catch (e: unknown) {
    const err = e as { data?: { message?: string | string[] }; message?: string };
    const message = err.data?.message ?? err.message ?? '登录失败';
    error.value = Array.isArray(message) ? message.join('，') : message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 380px;
  background: #fff;
  border: 1px solid #e6ebe9;
  border-radius: 10px;
  padding: 20px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
}

input {
  padding: 9px 12px;
  border: 1px solid #cfd8d5;
  border-radius: 8px;
  font-size: 14px;
}

button {
  padding: 10px 16px;
  border-radius: 8px;
  border: none;
  background: var(--hb-primary);
  color: #fff;
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  margin: 0;
  color: #c92a2a;
  font-size: 13px;
}

.muted {
  margin: 0;
  color: #6b7a76;
  font-size: 13px;
}
</style>
