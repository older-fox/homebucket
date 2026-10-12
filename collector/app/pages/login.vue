<script setup lang="ts">
/**
 * 登录页 —— 单页，不套应用外壳（规范 §6.8）。
 *
 * `layout: 'auth'` 是关键：default 外壳带着 256px 侧栏和顶栏面包屑，那是"已进入应用"
 * 的框架。登录页套在里面，未登录的人会看到一排置灰点不动的功能项和一份
 * "HomeBucket / 未找到的当前页"面包屑 —— 这对一个还没登录的人来说既无用也费解。
 * 单页布局只留一块全屏画布。
 *
 * `layout: false` 也不对：那样连语言与主题切换都没有，深色模式用户会在白底上登录。
 */
import { computed, onMounted, ref } from 'vue';
import { navigateTo, useRoute } from '#imports';
import { toAdminSessionError, useAdminSession } from '../composables/useAdminSession';

definePageMeta({ layout: 'auth' });

const route = useRoute();
const { t } = useI18n();
const { login } = useAdminSession();

const username = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

/**
 * ?redirect= 只接受站内路径：必须 "/" 开头且不能是 "//host"（否则就是开放重定向，
 * 攻击者能用 /login?redirect=https://evil.example 把登录成功的人送出去）。
 */
const redirectTo = computed(() => {
  const raw = route.query.redirect;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) return value;
  return '/admin';
});

/**
 * 服务端错误码 → 界面文案。刻意在页面里翻译而不是丢原始 message：
 * 服务端那串是给日志看的英文码，直接显示出来用户看不懂。
 */
function errorText(caught: unknown): string {
  const parsed = toAdminSessionError(caught);
  if (parsed.code === 'admin.badCredentials') return t('auth.badCredentials');
  if (parsed.code === 'rate.tooMany') return t('auth.tooManyAttempts', { seconds: parsed.retryAfterSeconds ?? 60 });
  if (parsed.code === 'validation.failed') return parsed.message || t('auth.invalidInput');
  if (parsed.status === 0) return t('auth.serviceUnreachable');
  return parsed.message;
}

async function submit(): Promise<void> {
  if (busy.value) return;
  error.value = '';
  busy.value = true;
  try {
    await login(username.value.trim(), password.value);
    await navigateTo(redirectTo.value);
  } catch (caught) {
    error.value = errorText(caught);
  } finally {
    busy.value = false;
  }
}

/**
 * 已经登录的人不该再看到登录页。
 *
 * 只在挂载后判断，且只是**把当前页换掉**，不在 SSR 期做任何跳转：令牌是 httpOnly cookie，
 * 服务端渲染时看不到它，在服务端判断"是否登录"永远得到"未登录"，会把已登录的首屏也搅乱。
 * `replace: true` 是因为登录页不该留在后退栈里 —— 回退再进登录页毫无意义。
 */
onMounted(async () => {
  const { refresh } = useAdminSession();
  const user = await refresh();
  if (user) await navigateTo(redirectTo.value, { replace: true });
});

useHead({
  title: computed(() => t('auth.loginTitle')),
  // 认证页不该被搜索引擎收录，也不该出现在别人的引用预览里
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
});

/**
 * 认证卡片的规格面（§6.8）：半透明 + 毛玻璃 + 深阴影 + 一圈细环。
 * 这里是全域唯一破例之处，别的地方一律不许照抄。
 */
const authCard =
  'rounded-2xl bg-white/90 p-6 shadow-xl shadow-gray-900/5 ring-1 ring-gray-200/80 backdrop-blur-sm sm:p-8 dark:bg-gray-900/80 dark:ring-gray-800 dark:shadow-black/40';
</script>

<template>
  <div class="w-full max-w-md">
    <!--
      卡片上方独立品牌头（规范 §6.8）：56px 渐变 Logo + 品牌名 + 一句话定位。
      登录页是用户唯一"什么都没看到就先把身份交出去"的界面，品牌头是这一屏的锚点。
    -->
    <div data-testid="page-head" class="mb-6 flex flex-col items-center gap-2 text-center">
      <span
        class="grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-lg font-bold tracking-wide text-white shadow-md shadow-blue-600/25"
      >
        {{ t('brand.mark') }}
      </span>
      <h1 class="m-0 text-2xl font-semibold tracking-tight">{{ t('brand.name') }}</h1>
      <p class="m-0 max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">{{ t('brand.tagline') }}</p>
    </div>

    <form :class="authCard" data-testid="login-form" @submit.prevent="submit">
      <UFormField :label="t('auth.login.username')" class="mb-4">
        <UInput
          v-model="username"
          data-testid="login-username"
          name="username"
          type="text"
          autocomplete="username"
          required
          autofocus
          size="lg"
          class="w-full"
          :placeholder="t('auth.login.usernamePlaceholder')"
        >
          <template #leading>
            <AppIcon name="user" class="h-[18px] w-[18px] text-gray-400 dark:text-gray-500" />
          </template>
        </UInput>
      </UFormField>

      <UFormField :label="t('auth.login.password')" class="mb-4">
        <UInput
          v-model="password"
          data-testid="login-password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
          size="lg"
          class="w-full"
          :placeholder="t('auth.login.passwordPlaceholder')"
        >
          <template #leading>
            <AppIcon name="lock" class="h-[18px] w-[18px] text-gray-400 dark:text-gray-500" />
          </template>
        </UInput>
      </UFormField>

      <UButton type="submit" color="primary" size="lg" block :loading="busy" data-testid="login-submit">
        {{ busy ? t('auth.login.submitBusy') : t('auth.login.submit') }}
      </UButton>

      <AppNotice v-if="error" tone="error" class="mt-4" data-testid="login-error">{{ error }}</AppNotice>
    </form>

    <!--
      返回公开查询的出口。收集器的公开页（查条码/统计）本来就不需要登录，
      但单页布局把侧栏去掉了，不给一个链接的话未登录的人会以为整个站点都要密码。
    -->
    <p class="mt-5 mb-0 text-center text-sm">
      <NuxtLink
        to="/"
        data-testid="login-back"
        class="rounded font-medium text-blue-700 transition-colors duration-150 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
      >
        {{ t('auth.login.browsePublic') }}
      </NuxtLink>
    </p>
  </div>
</template>
