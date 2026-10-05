<template>
  <div>
    <PageHeader :title="t('settings.title')" :description="current?.name" />

    <UTabs :items="tabs" class="tabs">
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
                <span class="row-sub">{{ member.email }}</span>
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
              <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-copy" class="hb-tap" @click="copy(inviteUrl(invite.token))">
                {{ t('common.copy') }}
              </UButton>
              <UButton v-if="isOwner" size="sm" color="error" variant="ghost" icon="i-lucide-ban" class="hb-tap" @click="revokeInvite(invite.id)">
                {{ t('settings.revoke') }}
              </UButton>
            </li>
          </ul>
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
                  <UBadge size="sm" variant="soft">{{ t(`notifier.${notifier.type}`) }}</UBadge>
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
  </div>
</template>

<script setup lang="ts">
interface Member {
  id: number;
  username: string;
  email: string;
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
const api = useApi();
const toast = useToast();
const { money, date } = useFormat();
const { families, current, load, switchTo, refresh: refreshFamilies } = useFamily();

const tabs = computed(() => [
  { label: t('settings.family'), slot: 'family' as const, icon: 'i-lucide-users' },
  { label: t('settings.system'), slot: 'system' as const, icon: 'i-lucide-settings' },
  { label: t('settings.notifiers'), slot: 'notifiers' as const, icon: 'i-lucide-bell' },
]);

onMounted(async () => {
  await load(true);
  await Promise.all([loadFamilyData(), loadNotifiers()]);
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

const typeOptions = Object.keys(NOTIFIER_FIELDS).map((type) => ({ label: t(`notifier.${type}`), value: type }));
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

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.add({ title: t('common.copied'), color: 'success' });
  } catch {
    window.prompt(t('common.copy'), text);
  }
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
}
</style>
