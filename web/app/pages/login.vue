<template>
  <div>
    <h2 class="title">{{ t('auth.loginTitle') }}</h2>
    <p class="subtitle hb-muted">{{ t('common.slogan') }}</p>

    <form class="form" @submit.prevent="submit">
      <UFormField :label="t('auth.username')">
        <UInput
          v-model="form.username"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          size="xl"
          icon="i-lucide-user-round"
          class="w-full"
          required
        />
      </UFormField>

      <UFormField :label="t('auth.password')">
        <UInput
          v-model="form.password"
          type="password"
          autocomplete="current-password"
          size="xl"
          icon="i-lucide-lock"
          class="w-full"
          required
        />
      </UFormField>

      <p v-if="error" class="error">
        <UIcon name="i-lucide-circle-alert" />
        <span>{{ error }}</span>
      </p>

      <UButton type="submit" size="xl" block class="hb-tap submit" :loading="loading">
        {{ t('auth.login') }}
      </UButton>
    </form>

    <p class="switch">
      {{ t('auth.noAccount') }}
      <NuxtLink :to="registerLink">{{ t('auth.goRegister') }}</NuxtLink>
    </p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'auth' });

const { t } = useI18n();
const { login } = useAuth();
const route = useRoute();

const form = reactive({ username: '', password: '' });
const loading = ref(false);
const error = ref('');

const redirect = computed(() => (route.query.redirect as string) || '/');
const registerLink = computed(() => {
  const invite = route.query.invite as string | undefined;
  return invite ? { path: '/register', query: { invite } } : '/register';
});

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    await login({ username: form.username, password: form.password }, redirect.value);
  } catch (e) {
    error.value = (e as { message?: string }).message ?? t('auth.loginFailed');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.title {
  margin: 0;
  font-size: var(--hb-fs-h2);
  font-weight: var(--hb-fw-bold);
  letter-spacing: var(--hb-ls-h2);
  text-align: center;
}

.subtitle {
  margin: 6px 0 20px;
  font-size: var(--hb-fs-sm);
  text-align: center;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--hb-r-sm);
  background: color-mix(in srgb, var(--hb-danger) 12%, transparent);
  color: var(--hb-danger);
  font-size: var(--hb-fs-sm);
  line-height: var(--hb-lh-sm);
}

.error :deep(svg) {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin-top: 1px;
}

.submit {
  margin-top: 2px;
}

.switch {
  margin: 18px 0 0;
  font-size: var(--hb-fs-sm);
  color: var(--hb-muted);
  text-align: center;
}

.switch a {
  color: var(--hb-brand);
  font-weight: 600;
  text-decoration: none;
}

.switch a:hover {
  text-decoration: underline;
}
</style>
