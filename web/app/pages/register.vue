<template>
  <div>
    <h2 class="title">{{ t('auth.registerTitle') }}</h2>

    <p v-if="invite" class="invite">
      <UIcon name="i-lucide-mail-plus" />
      <span>{{ t('auth.inviteAccept') }}</span>
    </p>
    <p v-else class="subtitle hb-muted">{{ t('common.slogan') }}</p>

    <form class="form" @submit.prevent="submit">
      <UFormField :label="t('auth.username')" :hint="t('auth.usernameHint')">
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

      <UFormField :label="t('auth.password')" :hint="t('auth.passwordHint')">
        <UInput
          v-model="form.password"
          type="password"
          autocomplete="new-password"
          size="xl"
          icon="i-lucide-lock"
          class="w-full"
          minlength="8"
          required
        />
      </UFormField>

      <!-- 邮箱选填：仅用于通知/找回，登录用用户名 -->
      <UFormField :label="t('auth.email')" :hint="t('auth.emailOptional')">
        <UInput
          v-model="form.email"
          type="email"
          autocomplete="email"
          inputmode="email"
          size="xl"
          icon="i-lucide-mail"
          class="w-full"
        />
      </UFormField>

      <p v-if="error" class="error">
        <UIcon name="i-lucide-circle-alert" />
        <span>{{ error }}</span>
      </p>

      <UButton type="submit" size="xl" block class="hb-tap submit" :loading="loading">
        {{ t('auth.register') }}
      </UButton>
    </form>

    <p class="switch">
      {{ t('auth.hasAccount') }}
      <NuxtLink :to="loginLink">{{ t('auth.goLogin') }}</NuxtLink>
    </p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'auth' });

const { t } = useI18n();
const { register } = useAuth();
const route = useRoute();

const form = reactive({ username: '', password: '', email: '' });
const loading = ref(false);
const error = ref('');

const invite = computed(() => (route.query.invite as string) || undefined);
const loginLink = computed(() => (invite.value ? { path: '/login', query: { invite: invite.value } } : '/login'));

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    await register(
      {
        username: form.username,
        password: form.password,
        email: form.email.trim() || undefined,
        inviteToken: invite.value,
      },
      invite.value ? `/invite/${invite.value}` : '/',
    );
  } catch (e) {
    error.value = (e as { message?: string }).message ?? t('auth.registerFailed');
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

.invite {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 14px 0 18px;
  padding: 9px 12px;
  border-radius: var(--hb-r-sm);
  background: var(--hb-brand-soft);
  color: var(--hb-brand);
  font-size: var(--hb-fs-sm);
  font-weight: var(--hb-fw-semibold);
}

.invite :deep(svg) {
  width: 16px;
  height: 16px;
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
