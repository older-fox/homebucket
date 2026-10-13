<template>
  <div class="setup">
    <header class="head">
      <h1>{{ t('setup.title') }}</h1>
      <p class="hint">{{ t('setup.subtitle') }}</p>
    </header>

    <!--
      自己画的进度条而不是 UStepper：UStepper 的 v-model 被它自己吃掉了
      （emits 里 Omit 了 update:modelValue，只暴露 defaultValue + next/prev），
      而引导页必须**强制线性**（第 2 步还没建账号就不该能跳到第 4 步）。
      这里每一步的"能不能点"直接由 reachableStep 决定，语义最清楚。
    -->
    <ol class="steps">
      <li v-for="(label, index) in stepLabels" :key="label">
        <button
          type="button"
          class="step"
          :class="{ current: step === index, done: index < step }"
          :disabled="index > reachableStep"
          @click="step = index"
        >
          <span class="dot">{{ index < step ? '✓' : index + 1 }}</span>
          <span class="label">{{ label }}</span>
        </button>
      </li>
    </ol>

    <p v-if="pageError" class="error">{{ pageError }}</p>
    <p v-if="loading" class="hint">{{ t('common.loading') }}</p>

    <div v-else class="body">
      <!-- ① 数据库 -->
      <template v-if="step === 0">
        <div v-if="databaseReady && !dbEditing" class="detected">
          <p class="hint">{{ t('setup.dbDetected') }}</p>
          <dl class="kv">
            <div>
              <dt>{{ t('setup.dbProvider') }}</dt>
              <dd>{{ status?.database.provider }}</dd>
            </div>
            <template v-if="status?.database.provider === 'sqlite'">
              <div>
                <dt>{{ t('setup.dbFilePath') }}</dt>
                <dd>{{ status.database.filePath }}</dd>
              </div>
            </template>
            <template v-else>
              <div>
                <dt>{{ t('setup.dbHost') }}</dt>
                <dd>{{ status?.database.host }}:{{ status?.database.port }}</dd>
              </div>
              <div>
                <dt>{{ t('setup.dbName') }}</dt>
                <dd>{{ status?.database.database }}</dd>
              </div>
              <div>
                <dt>{{ t('setup.dbUser') }}</dt>
                <dd>{{ status?.database.username || '—' }}</dd>
              </div>
            </template>
          </dl>
          <div class="actions">
            <UButton variant="outline" size="xl" class="hb-tap" @click="dbEditing = true">
              {{ t('setup.dbEdit') }}
            </UButton>
            <UButton size="xl" class="hb-tap" :loading="testing" @click="onTest">
              {{ t('setup.dbTest') }}
            </UButton>
            <UButton size="xl" class="hb-tap" @click="step = 1">{{ t('common.next') }}</UButton>
          </div>
        </div>

        <form v-else class="form" @submit.prevent="onDatabase">
          <p class="hint">{{ t('setup.dbIntro') }}</p>
          <UFormField :label="t('setup.dbProvider')">
            <USelect v-model="dbForm.provider" :items="providerOptions" size="xl" class="w-full" />
          </UFormField>

          <template v-if="dbForm.provider === 'sqlite'">
            <UFormField
              :label="t('setup.dbFilePath')"
              :hint="status?.database.lockedStorage ? t('setup.dbLockedHint') : undefined"
            >
              <UInput
                v-model="dbForm.filePath"
                size="xl"
                class="w-full"
                :disabled="Boolean(status?.database.lockedStorage)"
                placeholder="/data/homebucket.db"
              />
            </UFormField>
          </template>
          <template v-else>
            <UFormField :label="t('setup.dbHost')">
              <UInput v-model="dbForm.host" size="xl" class="w-full" placeholder="127.0.0.1" />
            </UFormField>
            <UFormField :label="t('setup.dbPort')">
              <UInput v-model="dbForm.port" size="xl" class="w-full" type="number" placeholder="3306" />
            </UFormField>
            <UFormField :label="t('setup.dbName')">
              <UInput v-model="dbForm.database" size="xl" class="w-full" placeholder="homebucket" />
            </UFormField>
            <UFormField :label="t('setup.dbUser')">
              <UInput v-model="dbForm.username" size="xl" class="w-full" autocomplete="off" />
            </UFormField>
            <UFormField :label="t('setup.dbPassword')">
              <UInput
                v-model="dbForm.password"
                size="xl"
                class="w-full"
                type="password"
                autocomplete="new-password"
              />
            </UFormField>
          </template>

          <div class="actions">
            <UButton type="submit" size="xl" class="hb-tap" :loading="busy">
              {{ t('setup.dbSave') }}
            </UButton>
            <UButton
              v-if="databaseReady"
              variant="outline"
              size="xl"
              class="hb-tap"
              @click="dbEditing = false"
            >
              {{ t('common.cancel') }}
            </UButton>
            <UButton variant="outline" size="xl" class="hb-tap" :loading="testing" @click="onTest">
              {{ t('setup.dbTest') }}
            </UButton>
          </div>
        </form>
      </template>

      <!-- ② 管理员 -->
      <form v-else-if="step === 1" class="form" @submit.prevent="onAdmin">
        <p class="hint">{{ t('setup.adminIntro') }}</p>
        <UFormField :label="t('auth.username')">
          <UInput v-model="adminForm.username" size="xl" class="w-full" autocomplete="username" required />
        </UFormField>
        <UFormField :label="t('auth.password')">
          <UInput
            v-model="adminForm.password"
            size="xl"
            class="w-full"
            type="password"
            autocomplete="new-password"
            required
          />
        </UFormField>
        <UFormField :label="t('auth.email')" :hint="t('auth.emailOptional')">
          <UInput v-model="adminForm.email" size="xl" class="w-full" autocomplete="email" />
        </UFormField>
        <div class="actions">
          <UButton type="submit" size="xl" class="hb-tap" :loading="busy">{{ t('setup.adminCreate') }}</UButton>
        </div>
      </form>

      <!-- ③ 实例设置（日志等不重要项已预填默认值，可一路下一步） -->
      <template v-else-if="step === 2">
        <p class="hint">{{ t('setup.settingsIntro') }}</p>
        <div v-for="group in settingsGroups" :key="group" class="group">
          <h3 class="group-title">{{ t(`settings.groups.${group}`) }}</h3>
          <SettingsFields
            :items="settingItems.filter((item) => item.group === group)"
            :draft="settings.draft"
            :is-dirty="settings.isDirty"
            :source-key="settings.sourceKey"
            @set="settings.setDraft"
            @reset="settings.resetField"
          />
        </div>
        <div class="actions">
          <UButton size="xl" class="hb-tap" :loading="settings.saving.value" @click="onSettingsNext">
            {{ t('common.next') }}
          </UButton>
        </div>
      </template>

      <!-- ④ 数据收集授权 -->
      <template v-else>
        <p class="hint">{{ t('setup.collectionIntro') }}</p>
        <p class="consent">{{ t('setup.collectionConsent') }}</p>
        <div class="group">
          <h3 class="group-title">{{ t('settings.groups.collection') }}</h3>
          <SettingsFields
            :items="settingItems.filter((item) => item.group === 'collection')"
            :draft="settings.draft"
            :is-dirty="settings.isDirty"
            :source-key="settings.sourceKey"
            @set="settings.setDraft"
            @reset="settings.resetField"
          />
        </div>
        <div class="actions">
          <UButton size="xl" class="hb-tap" :loading="busy" @click="onFinish">
            {{ t('setup.finish') }}
          </UButton>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DatabaseForm, SetupStatus } from '../composables/useSetup';

definePageMeta({ layout: 'auth' });

const { t } = useI18n();
const toast = useToast();
const setup = useSetup();
const settings = useInstanceSettings();

const step = ref(0);
const loading = ref(true);
const busy = ref(false);
const testing = ref(false);
const pageError = ref('');
const status = ref<SetupStatus | null>(null);
const dbEditing = ref(false);
const dbForm = ref<DatabaseForm>({ provider: 'sqlite', filePath: '/data/homebucket.db' });
const adminForm = reactive({ username: '', password: '', email: '' });

const stepLabels = computed(() => [
  t('setup.steps.database'),
  t('setup.steps.admin'),
  t('setup.steps.settings'),
  t('setup.steps.collection'),
]);

/**
 * 最远能走到哪一步：数据库没就绪就只能在第 1 步，没建账号就到第 2 步。
 * 之后的步骤需要 /api/admin/settings（要有会话），所以也卡在对应位置。
 */
const reachableStep = computed(() => {
  if (!databaseReady.value) return 0;
  if (!useAuth().user.value) return 1;
  return 2;
});

const providerOptions = computed(() => [
  { label: 'SQLite', value: 'sqlite' },
  { label: 'MySQL', value: 'mysql' },
]);

const databaseReady = computed(() => Boolean(status.value?.databaseAvailable));
const settingItems = computed(() => settings.items.value);
/** 第 3 步：除 collection 之外的分组（collection 留到第 4 步单独授权） */
const settingsGroups = computed(() => [
  ...new Set(settingItems.value.filter((item) => item.group !== 'collection').map((item) => item.group)),
]);

onMounted(async () => {
  try {
    status.value = await setup.status();
    // 已经初始化过就别进引导页了（可能是老标签页）
    if (!status.value.needsSetup) {
      await navigateTo('/');
      return;
    }
    // 用后端探测到的现值预填表单：用户通常只需要改错的那一项
    const detected = status.value.database;
    dbForm.value = {
      provider: detected.provider,
      filePath: detected.filePath ?? '/data/homebucket.db',
      host: detected.host ?? '127.0.0.1',
      port: detected.port ?? 3306,
      username: detected.username ?? '',
      database: detected.database ?? '',
    };
  } catch (error) {
    pageError.value = setup.messageOf(error);
  } finally {
    loading.value = false;
  }
});

async function onTest() {
  testing.value = true;
  pageError.value = '';
  try {
    await setup.testDatabase(dbForm.value);
    toast.add({ title: t('setup.dbTestOk'), color: 'success' });
  } catch (error) {
    pageError.value = setup.messageOf(error);
  } finally {
    testing.value = false;
  }
}

async function onDatabase() {
  busy.value = true;
  pageError.value = '';
  try {
    // 保存后后端会退出并由 entrypoint 按新配置重启，这里等它回来
    if (!(await setup.saveDatabase(dbForm.value))) {
      pageError.value = t('setup.restartTimeout');
      return;
    }
    status.value = await setup.status();
    dbEditing.value = false;
    step.value = 1;
  } catch (error) {
    pageError.value = setup.messageOf(error);
  } finally {
    busy.value = false;
  }
}

async function onAdmin() {
  busy.value = true;
  pageError.value = '';
  try {
    await setup.createAdmin({
      username: adminForm.username.trim(),
      password: adminForm.password,
      email: adminForm.email.trim() || undefined,
    });
    // 拿到会话后再加载设置：第 3/4 步用同一个 /api/admin/settings
    await settings.load();
    step.value = 2;
  } catch (error) {
    pageError.value = setup.messageOf(error);
  } finally {
    busy.value = false;
  }
}

async function onSettingsNext() {
  pageError.value = '';
  try {
    // 只有动过的项会被提交；没动就不写覆盖，保持 .env/默认值
    await settings.save();
  } catch (error) {
    pageError.value = settings.dirtyKeys.value.length ? setup.messageOf(error) : '';
  }
  step.value = 3;
}

async function onFinish() {
  busy.value = true;
  pageError.value = '';
  try {
    await settings.save();
    await setup.finish();
    await navigateTo('/');
  } catch (error) {
    pageError.value = setup.messageOf(error);
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.setup {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.head h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--hb-text-2);
}

.error {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--hb-danger);
}

.steps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
}

.step {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--hb-border);
  background: transparent;
  color: var(--hb-text-2);
  font-size: 12px;
  cursor: pointer;
}

.step:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.step.current {
  border-color: var(--hb-brand);
  color: var(--hb-brand);
}

.step.done {
  color: var(--hb-text);
}

.dot {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--hb-surface-2);
  font-size: 11px;
}

.step.current .dot {
  background: var(--hb-brand);
  color: #fff;
}

.body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.detected {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.kv {
  margin: 0;
  display: grid;
  gap: 6px;
}

.kv > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.kv dt {
  color: var(--hb-text-2);
}

.kv dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  word-break: break-all;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.group-title {
  margin: 6px 0 0;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--hb-text-2);
}

.consent {
  margin: 0;
  padding: 12px 14px;
  border-radius: var(--hb-r-lg);
  background: var(--hb-surface-2);
  font-size: 12px;
  line-height: 1.8;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}
</style>
