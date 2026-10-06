<template>
  <div>
    <h2 class="title">{{ invite ? t('auth.inviteTitle', { family: invite.familyName }) : t('common.loading') }}</h2>

    <template v-if="invite">
      <p class="from">{{ t('auth.inviteFrom', { user: invite.inviterName }) }}</p>
      <p class="meta">{{ t('auth.memberCount', { count: invite.memberCount }) }}</p>

      <UButton v-if="loggedIn" size="xl" block class="hb-tap" :loading="accepting" @click="accept">
        {{ t('auth.inviteAccept') }}
      </UButton>

      <!-- 实例关闭注册：只能登录后再加入（新账号需管理员创建） -->
      <div v-else class="actions">
        <UButton
          v-if="allowRegistration"
          size="xl"
          block
          class="hb-tap"
          @click="navigateTo({ path: '/register', query: { invite: token } })"
        >
          {{ t('auth.register') }}
        </UButton>
        <UButton
          color="neutral"
          variant="soft"
          size="xl"
          block
          class="hb-tap"
          @click="navigateTo({ path: '/login', query: { invite: token } })"
        >
          {{ t('auth.login') }}
        </UButton>
      </div>
    </template>

    <EmptyState v-else-if="error" :text="error" icon="i-lucide-link-2-off">
      <UButton size="sm" @click="navigateTo('/')">{{ t('common.back') }}</UButton>
    </EmptyState>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'auth' });

interface InviteInfo {
  familyId: number;
  familyName: string;
  inviterName: string;
  memberCount: number;
  expiresAt: string | null;
}

const { t } = useI18n();
const api = useApi();
const route = useRoute();
const toast = useToast();
const { user, fetchMe } = useAuth();
const { refresh } = useFamily();
const config = useSiteConfig();

const allowRegistration = computed(() => config.value.allowRegistration);

const token = String(route.params.token);
const invite = ref<InviteInfo | null>(null);
const error = ref('');
const accepting = ref(false);
const loggedIn = computed(() => !!user.value || !!api.token.value);

try {
  invite.value = await api.get<InviteInfo>(`/invites/${token}`);
} catch (e) {
  error.value = (e as { message?: string }).message ?? t('auth.inviteInvalid');
}

if (api.token.value && !user.value) await fetchMe();

async function accept() {
  accepting.value = true;
  try {
    await api.post(`/invites/${token}/accept`);
    await refresh();
    toast.add({ title: t('auth.inviteJoined'), color: 'success' });
    await navigateTo('/');
  } catch (e) {
    toast.add({ title: (e as { message?: string }).message ?? t('auth.inviteInvalid'), color: 'error' });
  } finally {
    accepting.value = false;
  }
}
</script>

<style scoped>
.title {
  margin: 0 0 8px;
  font-size: var(--hb-fs-h2);
  font-weight: var(--hb-fw-semibold);
}

.from {
  margin: 0 0 4px;
  font-size: var(--hb-fs-body);
  color: var(--hb-text-2);
}

.meta {
  margin: 0 0 18px;
  font-size: var(--hb-fs-xs);
  color: var(--hb-muted);
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
