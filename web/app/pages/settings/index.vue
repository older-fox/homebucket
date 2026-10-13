<template>
  <div>
    <PageHeader :title="t('settings.title')" :description="current?.name" />

    <UTabs v-model="activeTab" :items="tabs" class="tabs">
      <template #family>
        <section class="block">
          <h2>{{ t('settings.familyList') }}</h2>
          <ul class="rows hb-card">
            <li v-for="family in families" :key="family.id" class="row">
              <div class="row-main">
                <span class="row-title">
                  {{ family.name }}
                  <UBadge v-if="family.isPersonal" size="sm" variant="soft">{{ t('settings.you') }}</UBadge>
                </span>
                <span class="row-sub">
                  {{ t(`settings.${family.role === 'owner' ? 'owner' : family.role === 'admin' ? 'admin' : 'member'}`) }}
                  · {{ family.memberCount }} · {{ family.itemCount }}
                </span>
              </div>
              <UButton
                v-if="family.id !== current?.id"
                size="sm"
                color="neutral"
                variant="soft"
                class="hb-tap"
                @click="switchTo(family.id)"
              >
                {{ t('settings.switchTo') }}
              </UButton>
              <UBadge v-else size="sm" color="primary">{{ t('settings.currentFamily') }}</UBadge>
            </li>
          </ul>

          <form class="inline-form" @submit.prevent="createFamily">
            <UInput v-model="newFamilyName" :placeholder="t('settings.familyName')" size="lg" class="grow" />
            <UButton type="submit" size="lg" icon="i-lucide-plus" class="hb-tap" :loading="creatingFamily">
              {{ t('settings.createFamily') }}
            </UButton>
          </form>
        </section>

        <section v-if="current" class="block">
          <h2>{{ t('settings.members') }}</h2>
          <p v-if="!isOwner" class="hint">{{ t('settings.adminOnly') }}</p>
          <ul class="rows hb-card">
            <li v-for="member in members" :key="member.id" class="row">
              <div class="row-main">
                <span class="row-title">{{ member.username }}</span>
                <span class="row-sub">{{ member.email || t('common.none') }}</span>
              </div>
              <USelect
                v-if="isOwner && member.role !== 'owner'"
                :model-value="member.role"
                :items="roleOptions"
                size="sm"
                class="role-select"
                @update:model-value="(value: string) => changeRole(member.id, value)"
              />
              <UBadge v-else size="sm" variant="soft">
                {{ t(`settings.${member.role === 'owner' ? 'owner' : member.role === 'admin' ? 'admin' : 'member'}`) }}
              </UBadge>
              <UButton
                v-if="isOwner && member.role !== 'owner'"
                color="error"
                variant="ghost"
                size="sm"
                icon="i-lucide-user-minus"
                class="hb-tap"
                :aria-label="t('settings.removeMember')"
                @click="removeMember(member)"
              />
            </li>
          </ul>
        </section>

        <section v-if="current" class="block">
          <h2>{{ t('settings.invite') }}</h2>
          <p class="hint">{{ t('settings.inviteHint') }}</p>
          <form v-if="isOwner" class="inline-form" @submit.prevent="createInvite">
            <UInput
              v-model.number="inviteDays"
              type="number"
              inputmode="numeric"
              min="1"
              max="365"
              :placeholder="t('settings.inviteExpires')"
              size="lg"
              class="days"
            />
            <UButton type="submit" size="lg" icon="i-lucide-link" class="hb-tap" :loading="creatingInvite">
              {{ t('settings.createInvite') }}
            </UButton>
          </form>

          <EmptyState v-if="!invites.length" :text="t('settings.noInvites')" icon="i-lucide-link" />
          <ul v-else class="rows hb-card">
            <li v-for="invite in invites" :key="invite.id" class="row">
              <div class="row-main">
                <span class="row-title url">{{ inviteUrl(invite.token) }}</span>
                <span class="row-sub">
                  {{ invite.expiresAt ? date(invite.expiresAt) : t('settings.inviteNever') }}
                </span>
              </div>
              <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-copy" class="hb-tap" @click="copyInvite(inviteUrl(invite.token))">
                {{ t('common.copy') }}
              </UButton>
              <UButton v-if="isOwner" size="sm" color="error" variant="ghost" icon="i-lucide-ban" class="hb-tap" @click="revokeInvite(invite.id)">
                {{ t('settings.revoke') }}
              </UButton>
            </li>
          </ul>
        </section>
      </template>

      <template #account>
        <section class="block">
          <h2>{{ t('settings.account') }}</h2>
          <div class="account hb-card">
            <div class="account-avatar">
              <img v-if="profile.avatarUrl" :src="profile.avatarUrl" :alt="profile.username" class="avatar-img" />
              <span v-else class="avatar-fallback">{{ (profile.username || '?').slice(0, 1).toUpperCase() }}</span>
              <PhotoUploader
                :model-value="avatarIds"
                :initial="initialAvatar"
                :multiple="false"
                capture="user"
                @update:model-value="saveAvatar"
              />
            </div>

            <div class="account-main">
              <p class="account-name">
                <span class="row-title">{{ profile.username }}</span>
                <span class="hb-muted">{{ profile.email || '—' }}</span>
              </p>
              <form class="form" @submit.prevent="saveAccount">
                <UFormField :label="t('settings.alertDays')" :help="t('settings.alertDaysHint')">
                  <UInput
                    v-model.number="accountForm.takenOutAlertDays"
                    type="number"
                    min="0"
                    max="365"
                    size="xl"
                    class="w-full"
                  />
                </UFormField>
                <UButton type="submit" size="xl" class="hb-tap" :loading="savingAccount">{{ t('common.save') }}</UButton>
              </form>
              <p class="hint">{{ t('settings.avatarHint') }}</p>
            </div>
          </div>
        </section>
      </template>

      <template #apiKeys>
        <section class="block">
          <div class="block-head">
            <h2>{{ t('settings.apiKeys') }}</h2>
          </div>
          <p class="hint">{{ t('settings.apiKeyHint') }}</p>

          <form class="inline-form" @submit.prevent="createApiKey">
            <UInput
              v-model="apiKeyForm.name"
              :placeholder="t('settings.apiKeyNamePlaceholder')"
              size="xl"
              class="grow"
              required
            />
            <USelect
              v-model="apiKeyForm.scope"
              :items="apiKeyScopeOptions"
              size="xl"
              class="scope-select"
              :title="t('settings.apiKeyScopeHint')"
            />
            <UInput v-model="apiKeyForm.expiresAt" type="date" size="xl" :title="t('settings.apiKeyExpiresHint')" />
            <UButton type="submit" size="xl" class="hb-tap" :loading="creatingApiKey">
              {{ t('settings.apiKeyCreate') }}
            </UButton>
          </form>

          <EmptyState v-if="!apiKeys.length" :text="t('settings.apiKeyEmpty')" icon="i-lucide-key-round" />
          <ul v-else class="rows hb-card">
            <li v-for="key in apiKeys" :key="key.id" class="row" :class="{ revoked: key.revokedAt }">
              <div class="row-main">
                <span class="row-title">
                  {{ key.name }}
                  <span class="hb-mono hb-muted">{{ key.prefix }}…</span>
                  <span v-if="!key.revokedAt" class="hb-chip tiny" :class="key.scope">
                    {{ t(`settings.apiKeyScope_${key.scope}`) }}
                  </span>
                </span>
                <span class="row-sub">{{ apiKeySub(key) }}</span>
              </div>
              <UButton
                v-if="!key.revokedAt"
                size="sm"
                color="error"
                variant="ghost"
                icon="i-lucide-trash-2"
                class="hb-tap"
                :aria-label="t('common.delete')"
                @click="revokeApiKey(key)"
              />
            </li>
          </ul>
          <p class="hint">{{ t('settings.apiKeyLimitHint') }}</p>
        </section>

        <!-- 说明文档就在创建 key 的同一个页面里，不再单独占一个侧栏入口 -->
        <section class="block">
          <div class="block-head">
            <h2>{{ t('settings.apiDocs') }}</h2>
          </div>
          <ApiDocs hide-title />
        </section>
      </template>

      <template #system>
        <section v-if="current" class="block">
          <form class="form" @submit.prevent="saveSettings">
            <UFormField :label="t('settings.familyName')">
              <UInput v-model="settings.name" size="xl" class="w-full" />
            </UFormField>
            <UFormField :label="t('settings.currency')">
              <USelect v-model="settings.currency" :items="currencyOptions" size="xl" class="w-full" />
            </UFormField>
            <UFormField :label="t('settings.locale')">
              <USelect v-model="settings.locale" :items="localeOptions" size="xl" class="w-full" />
            </UFormField>
            <UFormField :label="t('settings.timeZone')">
              <UInput v-model="settings.timeZone" size="xl" class="w-full" placeholder="Asia/Shanghai" />
            </UFormField>
            <UButton type="submit" size="xl" class="hb-tap" :loading="savingSettings">{{ t('common.save') }}</UButton>
          </form>
        </section>
      </template>

      <template #notifiers>
        <section class="block">
          <div class="block-head">
            <h2>{{ t('settings.notifiers') }}</h2>
            <UButton size="sm" icon="i-lucide-plus" class="hb-tap" @click="openNotifier(null)">
              {{ t('settings.notifierAdd') }}
            </UButton>
          </div>

          <EmptyState v-if="!notifiers.length" :text="t('common.empty')" icon="i-lucide-bell" />
          <ul v-else class="rows hb-card">
            <li v-for="notifier in notifiers" :key="notifier.id" class="row">
              <div class="row-main">
                <span class="row-title">
                  {{ notifier.name }}
                  <UBadge size="sm" variant="soft">{{ t(`notifier.types.${notifier.type}`) }}</UBadge>
                </span>
                <span class="row-sub">
                  {{ notifier.events.length ? notifier.events.map((event) => t(`event.${event}`)).join(' / ') : t('common.all') }}
                </span>
              </div>
              <USwitch
                :model-value="notifier.enabled"
                @update:model-value="(value: boolean) => toggleNotifier(notifier, value)"
              />
              <UButton size="sm" color="neutral" variant="soft" class="hb-tap" :loading="testingId === notifier.id" @click="testNotifier(notifier)">
                {{ t('settings.test') }}
              </UButton>
              <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-pencil" class="hb-tap" @click="openNotifier(notifier)" />
              <UButton size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" class="hb-tap" @click="removeNotifier(notifier)" />
            </li>
          </ul>
        </section>
      </template>

      <!--
        实例设置：整个安装的全局配置（原 .env 里除数据库外那些项）。
        只有实例管理员能看到这个 tab；面板内部还会再按同一个标记决定要不要拉数据。
      -->
      <template #instance>
        <InstanceSettingsPanel />
      </template>
    </UTabs>

    <UModal v-model:open="notifierOpen" :title="notifierEditing ? t('common.edit') : t('settings.notifierAdd')">
      <template #body>
        <form class="form" @submit.prevent="saveNotifier">
          <UFormField :label="t('settings.notifierType')">
            <USelect v-model="notifierForm.type" :items="typeOptions" size="xl" class="w-full" :disabled="!!notifierEditing" />
          </UFormField>
          <UFormField :label="t('settings.notifierName')" required>
            <UInput v-model="notifierForm.name" size="xl" class="w-full" required />
          </UFormField>

          <UFormField v-for="field in currentFields" :key="field" :label="t(`notifier.${notifierForm.type}.${field}`)">
            <USwitch
              v-if="field === 'secure'"
              :model-value="notifierForm.config[field] === 'true'"
              @update:model-value="(value: boolean) => (notifierForm.config[field] = String(value))"
            />
            <UInput
              v-else
              v-model="notifierForm.config[field]"
              size="xl"
              class="w-full"
              :type="field === 'port' ? 'number' : field === 'pass' || field === 'botToken' || field === 'serverKey' || field === 'sendKey' ? 'password' : 'text'"
            />
          </UFormField>

          <UFormField :label="t('settings.notifierEvents')" :hint="t('settings.notifierEventsHint')">
            <div class="events">
              <UCheckbox
                v-for="event in eventOptions"
                :key="event.value"
                :model-value="notifierForm.events.includes(event.value)"
                :label="event.label"
                @update:model-value="(checked: boolean | 'indeterminate') => toggleEvent(event.value, checked === true)"
              />
            </div>
          </UFormField>

          <div class="form-actions">
            <UButton type="submit" size="xl" class="hb-tap" :loading="savingNotifier">{{ t('common.save') }}</UButton>
            <UButton color="neutral" variant="ghost" size="xl" class="hb-tap" @click="notifierOpen = false">
              {{ t('common.cancel') }}
            </UButton>
          </div>
        </form>
      </template>
    </UModal>

    <!-- 新建的 key 明文只在这里出现一次，关掉就再也拿不到 -->
    <UModal v-model:open="tokenOpen" :title="t('settings.apiKeyCreate')">
      <template #body>
        <p class="hint">{{ t('settings.apiKeyCreatedTip') }}</p>
        <p class="token hb-mono hb-break">{{ createdToken }}</p>
        <div class="form-actions">
          <UButton color="neutral" variant="soft" icon="i-lucide-copy" class="hb-tap" @click="copyToken">
            {{ t('common.copy') }}
          </UButton>
          <UButton class="hb-tap" @click="tokenOpen = false">{{ t('common.close') }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
interface Member {
  id: number;
  username: string;
  email: string | null;
  role: string;
}

interface Invite {
  id: number;
  token: string;
  expiresAt: string | null;
}

interface Notifier {
  id: number;
  type: string;
  name: string;
  enabled: boolean;
  events: string[];
  config: Record<string, string>;
}

interface ApiKey {
  id: number;
  name: string;
  prefix: string;
  /** read = 只能读；write = 额外可写物品（属性/序列号/库存/取走归还/增删） */
  scope: 'read' | 'write';
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface Profile {
  id: number;
  username: string;
  email: string | null;
  takenOutAlertDays: number;
  avatarId: number | null;
  avatarUrl: string | null;
  /** 实例管理员（决定「实例设置」这个 tab 显不显示；真正的权限在服务端） */
  isInstanceAdmin: boolean;
}

const NOTIFIER_FIELDS: Record<string, string[]> = {
  smtp: ['host', 'port', 'secure', 'user', 'pass', 'from', 'to'],
  googlechat: ['webhookUrl'],
  telegram: ['botToken', 'chatId'],
  discord: ['webhookUrl'],
  dingtalk: ['webhookUrl', 'secret'],
  feishu: ['webhookUrl'],
  wecom: ['webhookUrl'],
  bark: ['serverKey', 'serverUrl'],
  serverchan: ['sendKey'],
};

const EVENTS = ['invite_created', 'member_joined', 'item_created', 'item_updated', 'location_created'];

const { t } = useI18n();
const route = useRoute();
const api = useApi();
const toast = useToast();
const { copy } = useClipboard();
const { money, date, relative } = useFormat();
const { families, current, load, switchTo, refresh: refreshFamilies } = useFamily();

const { user } = useAuth();

/**
 * 实例设置只在管理员可见。
 *
 * 用登录用户身上的标记（中间件每次导航都会刷新它），而不是本页 `loadAccount()` 拿到的
 * profile：tab 列表在 setup 期就要算出来，那时 profile 还没拉回来。
 * 这只影响显隐 —— 接口那边由 `InstanceAdminGuard` 把关，改前端绕过不了。
 */
const isInstanceAdmin = computed(() => user.value?.isInstanceAdmin === true);

const tabs = computed(() => [
  { label: t('settings.family'), value: 'family', slot: 'family' as const, icon: 'i-lucide-users' },
  { label: t('settings.account'), value: 'account', slot: 'account' as const, icon: 'i-lucide-user-round' },
  { label: t('settings.apiKeys'), value: 'apiKeys', slot: 'apiKeys' as const, icon: 'i-lucide-key-round' },
  { label: t('settings.system'), value: 'system', slot: 'system' as const, icon: 'i-lucide-settings' },
  { label: t('settings.notifiers'), value: 'notifiers', slot: 'notifiers' as const, icon: 'i-lucide-bell' },
  ...(isInstanceAdmin.value
    ? [{ label: t('settings.instance'), value: 'instance', slot: 'instance' as const, icon: 'i-lucide-server-cog' }]
    : []),
]);

/**
 * 初始 tab：顶栏提醒角标会带着 ?tab=account 跳进来（提醒已关闭时给用户的出口）。
 * 认不出就落回第一个 tab —— 非管理员手敲 ?tab=instance 也走这条路，不会看到一个空 tab。
 */
const requestedTab = typeof route.query.tab === 'string' ? route.query.tab : '';
const activeTab = ref(tabs.value.some((tab) => tab.value === requestedTab) ? requestedTab : 'family');

onMounted(async () => {
  await load(true);
  await Promise.all([loadFamilyData(), loadNotifiers(), loadAccount(), loadApiKeys()]);
});

const isOwner = computed(() => current.value?.isOwner || current.value?.role === 'owner');

const members = ref<Member[]>([]);
const invites = ref<Invite[]>([]);
const notifiers = ref<Notifier[]>([]);

const newFamilyName = ref('');
const creatingFamily = ref(false);
const inviteDays = ref<number | null>(7);
const creatingInvite = ref(false);

const settings = reactive({ name: '', currency: 'CNY', locale: 'zh-CN', timeZone: 'Asia/Shanghai' });
const savingSettings = ref(false);

// 账号资料（GET/PATCH /auth/me）
const profile = ref<Profile>({ id: 0, username: '', email: null, takenOutAlertDays: 7, avatarId: null, avatarUrl: null, isInstanceAdmin: false });
const accountForm = reactive({ takenOutAlertDays: 7 });
const savingAccount = ref(false);

/** PhotoUploader 的 v-model 是 id 数组，头像只取第一张 */
const avatarIds = computed(() => (profile.value.avatarId ? [profile.value.avatarId] : []));
const initialAvatar = computed(() =>
  profile.value.avatarId && profile.value.avatarUrl ? [{ id: profile.value.avatarId, url: profile.value.avatarUrl }] : [],
);

// API key（GET/POST/DELETE /api-keys）
const apiKeys = ref<ApiKey[]>([]);
// 默认只读：想要写权限必须显式选一次（与后端「不传 scope = read」同一口径）
const apiKeyForm = reactive<{ name: string; scope: 'read' | 'write'; expiresAt: string }>({
  name: '',
  scope: 'read',
  expiresAt: '',
});
const creatingApiKey = ref(false);
const tokenOpen = ref(false);
const createdToken = ref('');

const notifierOpen = ref(false);
const notifierEditing = ref<Notifier | null>(null);
const savingNotifier = ref(false);
const testingId = ref<number | null>(null);
const notifierForm = reactive<{ type: string; name: string; events: string[]; config: Record<string, string> }>({
  type: 'smtp',
  name: '',
  events: [],
  config: {},
});

const roleOptions = computed(() => [
  { label: t('settings.admin'), value: 'admin' },
  { label: t('settings.member'), value: 'member' },
]);

const currencyOptions = [
  'CNY', 'USD', 'EUR', 'JPY', 'GBP', 'HKD', 'TWD', 'SGD', 'AUD', 'CAD', 'KRW', 'INR', 'RUB', 'BRL', 'CHF', 'THB',
].map((code) => ({ label: code, value: code }));

const localeOptions = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'de', 'es'].map((code) => ({ label: code, value: code }));
const apiKeyScopeOptions = (['read', 'write'] as const).map((scope) => ({
  label: t(`settings.apiKeyScope_${scope}`),
  value: scope,
}));

const typeOptions = Object.keys(NOTIFIER_FIELDS).map((type) => ({ label: t(`notifier.types.${type}`), value: type }));
const eventOptions = computed(() => EVENTS.map((event) => ({ label: t(`event.${event}`), value: event })));
const currentFields = computed(() => NOTIFIER_FIELDS[notifierForm.type] ?? []);

async function loadFamilyData() {
  if (!current.value) {
    members.value = [];
    invites.value = [];
    return;
  }
  settings.name = current.value.name;
  settings.currency = current.value.currency;
  settings.locale = current.value.locale;
  settings.timeZone = current.value.timeZone;

  const [memberRows, inviteRows] = await Promise.all([
    api.get<Member[]>(`/families/${current.value.id}/members`),
    api.get<Invite[]>(`/families/${current.value.id}/invites`),
  ]);
  members.value = memberRows;
  invites.value = inviteRows;
}

async function loadNotifiers() {
  notifiers.value = await api.get<Notifier[]>('/notifiers');
}

/** 账号资料：头像与提醒阈值都挂在账号上（不分家庭） */
async function loadAccount() {
  profile.value = await api.get<Profile>('/auth/me');
  accountForm.takenOutAlertDays = profile.value.takenOutAlertDays;
}

async function saveAccount() {
  const days = Number(accountForm.takenOutAlertDays);
  if (!Number.isInteger(days) || days < 0 || days > 365) {
    toast.add({ title: t('validation.failed'), color: 'error' });
    return;
  }
  savingAccount.value = true;
  try {
    profile.value = await api.patch<Profile>('/auth/me', { takenOutAlertDays: days });
    toast.add({ title: t('common.saved'), color: 'success' });
  } catch (error) {
    fail(error);
  } finally {
    savingAccount.value = false;
  }
}

/** 头像改即存（和成员角色、通知器开关一样不需要额外点保存） */
async function saveAvatar(ids: number[]) {
  const avatarId = ids[0] ?? null;
  if (avatarId === profile.value.avatarId) return;
  try {
    profile.value = await api.patch<Profile>('/auth/me', { avatarId });
  } catch (error) {
    fail(error);
    await loadAccount();
  }
}

async function loadApiKeys() {
  apiKeys.value = await api.get<ApiKey[]>('/api-keys');
}

function apiKeySub(key: ApiKey) {
  if (key.revokedAt) return t('settings.apiKeyRevoked');
  const parts: string[] = [
    key.lastUsedAt ? t('settings.apiKeyLastUsed', { time: relative(key.lastUsedAt) }) : t('settings.apiKeyNeverUsed'),
  ];
  if (key.expiresAt) {
    // 过期判断放在前端只为了显示：真正的过期由后端 authenticate() 卡住
    parts.push(
      new Date(key.expiresAt).getTime() <= Date.now()
        ? t('settings.apiKeyExpired')
        : t('settings.apiKeyExpiresAt', { date: date(key.expiresAt) }),
    );
  }
  return parts.join(t('common.listSeparator'));
}

async function createApiKey() {
  if (!apiKeyForm.name.trim()) return;
  creatingApiKey.value = true;
  try {
    // expiresAt 留空时不能传空串：后端用 @Matches 校验格式
    const body: { name: string; scope: 'read' | 'write'; expiresAt?: string } = {
      name: apiKeyForm.name.trim(),
      scope: apiKeyForm.scope,
    };
    if (apiKeyForm.expiresAt) body.expiresAt = apiKeyForm.expiresAt;
    const created = await api.post<ApiKey & { token: string }>('/api-keys', body);
    createdToken.value = created.token;
    tokenOpen.value = true;
    apiKeyForm.name = '';
    // scope 不重置：连着建多把同权限的 key 时不用每次重选；下一次建 key 前一眼能看到当前选择
    apiKeyForm.expiresAt = '';
    await loadApiKeys();
  } catch (error) {
    fail(error);
  } finally {
    creatingApiKey.value = false;
  }
}

async function revokeApiKey(key: ApiKey) {
  if (!window.confirm(t('settings.apiKeyRevokeConfirm', { name: key.name }))) return;
  try {
    await api.del(`/api-keys/${key.id}`);
    await loadApiKeys();
  } catch (error) {
    fail(error);
  }
}

async function copyToken() {
  // 用 copy() 的 prompt 回退：key 很长，剪贴板不可用时至少能手动选中
  await copy(createdToken.value, { fallback: 'prompt' });
}

function fail(error: unknown) {
  toast.add({ title: (error as { message?: string }).message ?? t('errors.unknown'), color: 'error' });
}

async function createFamily() {
  if (!newFamilyName.value.trim()) return;
  creatingFamily.value = true;
  try {
    await api.post('/families', { name: newFamilyName.value.trim() });
    newFamilyName.value = '';
    await refreshFamilies();
    toast.add({ title: t('common.created'), color: 'success' });
  } catch (error) {
    fail(error);
  } finally {
    creatingFamily.value = false;
  }
}

async function saveSettings() {
  if (!current.value) return;
  savingSettings.value = true;
  try {
    await api.patch(`/families/${current.value.id}`, { ...settings });
    await refreshFamilies();
    toast.add({ title: t('common.saved'), color: 'success' });
  } catch (error) {
    fail(error);
  } finally {
    savingSettings.value = false;
  }
}

async function changeRole(userId: number, role: string) {
  if (!current.value) return;
  try {
    await api.patch(`/families/${current.value.id}/members/${userId}`, { role });
    await loadFamilyData();
  } catch (error) {
    fail(error);
  }
}

async function removeMember(member: Member) {
  if (!current.value) return;
  if (!window.confirm(t('settings.removeConfirm', { name: member.username }))) return;
  try {
    await api.del(`/families/${current.value.id}/members/${member.id}`);
    await loadFamilyData();
    toast.add({ title: t('common.deleted'), color: 'success' });
  } catch (error) {
    fail(error);
  }
}

async function createInvite() {
  if (!current.value) return;
  creatingInvite.value = true;
  try {
    await api.post(`/families/${current.value.id}/invites`, { expiresInDays: inviteDays.value ?? undefined });
    await loadFamilyData();
  } catch (error) {
    fail(error);
  } finally {
    creatingInvite.value = false;
  }
}

async function revokeInvite(id: number) {
  if (!current.value) return;
  try {
    await api.del(`/families/invites/${id}`);
    await loadFamilyData();
  } catch (error) {
    fail(error);
  }
}

function inviteUrl(token: string) {
  return `${window.location.origin}/invite/${token}`;
}

// 邀请链接比较长，失败时用系统输入框让人可以手动选中
function copyInvite(text: string) {
  return copy(text, { fallback: 'prompt' });
}

function openNotifier(notifier: Notifier | null) {
  notifierEditing.value = notifier;
  Object.assign(notifierForm, {
    type: notifier?.type ?? 'smtp',
    name: notifier?.name ?? '',
    events: notifier?.events ?? [],
    config: { ...(notifier?.config ?? {}) },
  });
  notifierOpen.value = true;
}

function toggleEvent(event: string, checked: boolean) {
  notifierForm.events = checked
    ? [...notifierForm.events, event]
    : notifierForm.events.filter((item) => item !== event);
}

async function saveNotifier() {
  savingNotifier.value = true;
  try {
    const payload = {
      type: notifierForm.type,
      name: notifierForm.name,
      events: notifierForm.events,
      config: notifierForm.config,
    };
    if (notifierEditing.value) await api.patch(`/notifiers/${notifierEditing.value.id}`, payload);
    else await api.post('/notifiers', payload);
    notifierOpen.value = false;
    await loadNotifiers();
    toast.add({ title: t('common.saved'), color: 'success' });
  } catch (error) {
    fail(error);
  } finally {
    savingNotifier.value = false;
  }
}

async function toggleNotifier(notifier: Notifier, enabled: boolean) {
  try {
    await api.patch(`/notifiers/${notifier.id}`, { enabled });
    await loadNotifiers();
  } catch (error) {
    fail(error);
  }
}

async function testNotifier(notifier: Notifier) {
  testingId.value = notifier.id;
  try {
    await api.post(`/notifiers/${notifier.id}/test`);
    toast.add({ title: t('settings.testSent'), color: 'success' });
  } catch (error) {
    const message = (error as { message?: string }).message ?? t('errors.unknown');
    toast.add({ title: t('settings.testFailed', { message }), color: 'error' });
  } finally {
    testingId.value = null;
  }
}

async function removeNotifier(notifier: Notifier) {
  if (!window.confirm(t('settings.deleteConfirm', { name: notifier.name }))) return;
  try {
    await api.del(`/notifiers/${notifier.id}`);
    await loadNotifiers();
  } catch (error) {
    fail(error);
  }
}

</script>
<style scoped>
.block {
  margin-top: 16px;
}

.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

h2 {
  margin: 0;
  font-size: var(--hb-fs-h3);
  font-weight: var(--hb-fw-semibold);
}

.hint {
  margin: 0 0 8px;
  font-size: var(--hb-fs-xs);
  color: var(--hb-muted);
}

.rows {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  overflow: hidden;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--hb-border);
  flex-wrap: wrap;
}

.row:last-child {
  border-bottom: none;
}

.row-main {
  flex: 1;
  min-width: 140px;
}

.row-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--hb-fs-body);
  font-weight: var(--hb-fw-medium);
}

.row-sub {
  display: block;
  margin-top: 2px;
  font-size: var(--hb-fs-xs);
  color: var(--hb-muted);
}

/* 已撤销的 key 只留一行痕迹：不再提供撤销按钮，整行压暗 */
.row.revoked .row-main {
  opacity: 0.55;
}

.url {
  font-family: ui-monospace, monospace;
  font-size: var(--hb-fs-xs);
  word-break: break-all;
}

.inline-form {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.grow {
  flex: 1;
}

.days {
  width: 120px;
}

.role-select {
  width: 110px;
}

/* 权限选择：窄到不挤压名字输入框，又能完整显示「可写物品」 */
.scope-select {
  width: 132px;
}

/* 权限胶囊别折行：移动端行里空间紧张时，先挤名字也不要让「可写物品」断成两行 */
.row-title .hb-chip {
  flex: 0 0 auto;
  white-space: nowrap;
}

.account {
  display: flex;
  gap: 16px;
  padding: 14px;
}

.account-avatar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.avatar-img,
.avatar-fallback {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 1px solid var(--hb-border);
  object-fit: cover;
}

.avatar-fallback {
  display: grid;
  place-items: center;
  background: var(--hb-surface-2);
  color: var(--hb-brand);
  font-size: var(--hb-fs-h3);
  font-weight: var(--hb-fw-semibold);
}

.account-main {
  flex: 1;
  min-width: 0;
}

.account-name {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 0 12px;
}

.token {
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid var(--hb-border);
  border-radius: var(--hb-r-sm);
  background: var(--hb-surface-2);
  font-size: var(--hb-fs-xs);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-actions {
  display: flex;
  gap: 8px;
}

.events {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

@media (max-width: 640px) {
  .inline-form {
    flex-wrap: wrap;
  }

  .days {
    width: 100%;
  }

  .account {
    flex-direction: column;
    align-items: center;
  }

  .account-main {
    width: 100%;
  }
}
</style>
