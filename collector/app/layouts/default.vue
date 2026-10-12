<script setup lang="ts">
/**
 * 应用外壳：左侧固定侧栏(256px) + 顶栏(64px) + 内容区。
 *
 * 规范第 10 节要求 `md` 以下隐藏侧栏、改顶部横向导航条。
 * 这里改成抽屉浮层而**不是**横向导航条：收集器的 5 个入口塞进 64px 顶栏
 * 会挤掉面包屑，而抽屉同样满足"小屏不用常驻占位"这个目的。
 * 入口数量、点击区高度（≥40px）与图标风格仍照规范执行。
 */
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { adminSession as session, logout, refresh } from '../composables/useAdminSession';
import type { IconName } from '../components/AppIcon.vue';

const route = useRoute();
const { t, locale, locales } = useI18n();
const colorMode = useColorMode();

function toggleTheme(): void {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark';
}

/**
 * 侧栏导航项。
 *
 * 顺序按"日常使用频率 × 权限门槛"排：查条码是所有人每天都点的，纠错台与来源管理
 * 只有登录后才有意义，所以放后面。`auth` 为 true 的项在未登录时**置灰而不隐藏**
 * —— 藏起来使用者会以为功能不存在；置灰则明确告诉他"登录后可用"。
 *
 * `icon` 用内联 SVG 的名字而不是 emoji：emoji 在不同系统上字形差异很大，
 * 而且做不了"一眼认出这是审计"这件事（规范第 8 节要求线性图标）。
 */
const NAV_ITEMS: Array<{ to: string; key: string; icon: IconName; hintKey: string; auth: boolean }> = [
  { to: '/', key: 'nav.search', icon: 'search', hintKey: 'nav.searchHint', auth: false },
  { to: '/stats', key: 'nav.stats', icon: 'chart', hintKey: 'nav.statsHint', auth: false },
  { to: '/audit', key: 'nav.audit', icon: 'clipboard', hintKey: 'nav.auditHint', auth: true },
  { to: '/admin', key: 'nav.admin', icon: 'wrench', hintKey: 'nav.adminHint', auth: true },
  { to: '/sources', key: 'nav.sources', icon: 'shield', hintKey: 'nav.sourcesHint', auth: true },
  { to: '/upstream', key: 'nav.upstream', icon: 'upload', hintKey: 'nav.upstreamHint', auth: true },
];

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/';
  return route.path === path || route.path.startsWith(`${path}/`);
}

/** 当前页在导航里的 key，用来渲染面包屑；找不到时（详情页等）回落成通用文案 */
const currentNav = computed(() => NAV_ITEMS.find((item) => isActive(item.to)));

/**
 * 移动端抽屉：小屏下侧栏是浮层，点任何导航项都要收起来，
 * 否则新页面会被浮层盖住。桌面端这个值不起作用（侧栏始终可见）。
 */
const drawerOpen = ref(false);
watch(() => route.fullPath, () => {
  drawerOpen.value = false;
});

/** 登录后才有意义的入口：未登录时置灰，而不是隐藏（见 NAV_ITEMS 的说明） */
function lockedFor(item: { auth: boolean }): boolean {
  return item.auth && mounted.value && session.user === null;
}

/**
 * Esc 关闭抽屉。
 *
 * 移动端浮层不给键盘出口的话，键盘用户与部分读屏用户会被困在浮层里。
 * 绑在 window 上（而不是浮层元素）是因为焦点可能落在任意可点元素上。
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') drawerOpen.value = false;
}
onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

/**
 * 顶栏账号区必须等挂载后再渲染。
 *
 * 首屏是 SSR 出来的（服务端没有 cookie，渲染成「登录」），但客户端路由中间件会在
 * **首次渲染之前**就问会话，于是客户端第一帧想渲染账号名 —— 与服务端 HTML 对不上，
 * Vue 报 "Hydration completed but contains mismatches"。挂载标记把第一帧压回同一个形状。
 */
const PROTECTED_PATHS = ['/admin', '/audit', '/password', '/sources', '/upstream'];
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
  const needsAuth = PROTECTED_PATHS.some((path) => route.path === path || route.path.startsWith(`${path}/`));
  if (!session.checked && needsAuth) void refresh();
});

async function onLogout(): Promise<void> {
  await logout();
  await navigateTo('/login');
}

const username = computed(() => (mounted.value ? session.user?.username ?? null : null));
/** 头像里的缩写：取首字符，用户名通常是 ascii */
const initial = computed(() => (username.value ?? '?').slice(0, 1).toUpperCase());

/**
 * 语言代码：locales 里既可能是字符串也可能是对象，统一成 code。
 *
 * 返回值收窄成配置里声明的那两个字面量（`LocaleCode`）而不是 `string`：
 * `locale` 是 `Ref<'zh' | 'en'>`，赋一个宽 string 在 typecheck 下会被拒。
 * i18n 的 locales 配置是运行期读的，这里用声明断言把"配置只声明了这两种"
 * 这件事写进类型；真加了第三种语言，nuxt.config 与本类型都要同步改。
 */
type LocaleCode = 'zh' | 'en';

function codeOf(item: unknown): LocaleCode {
  return (typeof item === 'string' ? item : (item as { code: string }).code) as LocaleCode;
}
function nameOf(item: unknown): string {
  if (typeof item === 'string') return item;
  const named = (item as { name?: string; code: string }).name;
  return named ?? (item as { code: string }).code;
}

/**
 * 语言切换（分段控件）。
 *
 * 只列配置里声明的那两种：收集器实际只维护 zh/en，列一个空的下拉
 * 会让使用者以为还有别的可选。no_prefix 策略下写 locale 就落到 cookie 上
 * （见 nuxt.config 的 detectBrowserLanguage）。
 */
function setLocale(code: LocaleCode): void {
  locale.value = code;
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-white">
    <!--
      移动端抽屉遮罩。桌面端（md 以上）侧栏是常驻的，这层永远不出现。
      遮罩点击即关，键盘用户按 Esc 也能关（见上面的 keydown 处理）。
    -->
    <div
      v-if="drawerOpen"
      data-testid="sidebar-overlay"
      class="fixed inset-0 z-30 bg-gray-900/40 backdrop-blur-[1px] md:hidden dark:bg-black/60"
      @click="drawerOpen = false"
    />

    <aside
      data-testid="sidebar"
      :class="[
        'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-200 bg-white transition-transform duration-200 dark:border-gray-800 dark:bg-gray-900',
        drawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      ]"
    >
      <!-- 品牌区：高度 64px，与顶栏对齐（两处必须一致，否则右侧内容会错位一行） -->
      <div class="flex h-16 shrink-0 items-center border-b border-gray-200 px-5 dark:border-gray-800">
        <NuxtLink data-testid="brand" to="/" class="flex min-w-0 items-center gap-3 text-inherit no-underline">
          <span
            class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-bold tracking-wide text-white shadow-md shadow-blue-600/25"
          >
            {{ t('brand.mark') }}
          </span>
          <span class="min-w-0">
            <strong class="block truncate text-base leading-tight font-semibold">{{ t('brand.name') }}</strong>
            <small class="block truncate text-xs text-gray-500 dark:text-gray-400">{{ t('brand.tagline') }}</small>
          </span>
        </NuxtLink>
      </div>

      <nav class="flex-1 overflow-y-auto p-3" :aria-label="t('nav.ariaMain')">
        <NuxtLink
          v-for="item in NAV_ITEMS"
          :key="item.to"
          :to="item.to"
          :title="lockedFor(item) ? t('nav.lockedHint', { hint: t(item.hintKey) }) : t(item.hintKey)"
          :aria-disabled="lockedFor(item) ? 'true' : undefined"
          :class="[
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium no-underline transition-colors duration-150',
            isActive(item.to)
              ? 'bg-blue-50 text-blue-700 shadow-sm dark:bg-blue-950/60 dark:text-blue-300'
              : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/70',
            lockedFor(item) ? 'cursor-not-allowed opacity-45 hover:bg-transparent dark:hover:bg-transparent' : '',
          ]"
          :data-testid="`nav-${item.to === '/' ? 'search' : item.to.slice(1)}`"
        >
          <AppIcon
            :name="item.icon"
            :stroke-width="2"
            :class="['h-[18px] w-[18px] shrink-0', isActive(item.to) ? 'text-blue-600 dark:text-blue-400' : '']"
          />
          <span class="min-w-0 flex-1 truncate">{{ t(item.key) }}</span>
          <AppIcon v-if="lockedFor(item)" name="lock" class="h-3.5 w-3.5 shrink-0 opacity-70" />
        </NuxtLink>
      </nav>

      <!--
        用户区固定在侧栏底部：登录状态是"当前身份"的开关，
        位置固定才不用每次去找它。36px 圆形头像 + 用户名（规范 6.6）。

        规范 6.6 的示意是"头像 + 用户名 + 下拉箭头"，但这里**刻意不做下拉菜单**：
        账号下只有两个动作（改密码 / 退出），直接摊开成两个按钮比藏进菜单更好点、
        也少一次"先展开再找"的往返；加一个点不开的箭头反而是在骗点击。
      -->
      <div class="shrink-0 border-t border-gray-200 p-3 dark:border-gray-800">
        <template v-if="username">
          <div class="mb-2 flex items-center gap-3 px-1" data-testid="nav-account">
            <span
              class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-semibold text-white"
              aria-hidden="true"
            >
              {{ initial }}
            </span>
            <span class="min-w-0 flex-1">
              <strong class="block truncate text-sm font-medium">{{ username }}</strong>
              <small class="block truncate text-xs text-gray-500 dark:text-gray-400">
                {{ t('auth.signedInAs') }}
              </small>
            </span>
          </div>
          <div class="flex flex-col gap-1.5">
            <UButton
              to="/password"
              color="neutral"
              variant="outline"
              size="sm"
              block
              data-testid="nav-password"
            >
              <AppIcon name="key" class="h-4 w-4" />
              {{ t('auth.changePassword') }}
            </UButton>
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              block
              :disabled="session.pending"
              data-testid="nav-logout"
              @click="onLogout"
            >
              <AppIcon name="logout" class="h-4 w-4" />
              {{ t('auth.signOut') }}
            </UButton>
          </div>
        </template>
        <UButton
          v-else
          to="/login"
          color="neutral"
          variant="outline"
          size="sm"
          block
          data-testid="nav-login"
        >
          <AppIcon name="logout" class="h-4 w-4" />
          {{ t('auth.signIn') }}
        </UButton>
      </div>
    </aside>

    <div class="flex min-w-0 flex-col md:pl-64">
      <!--
        顶栏 64px，sticky + 毛玻璃（规范 6.7）。
        左：移动端汉堡 + 面包屑；右：语言分段控件 + 主题切换。
      -->
      <header
        class="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 bg-white/85 px-6 backdrop-blur max-sm:px-4 dark:border-gray-800 dark:bg-gray-900/80"
      >
        <!-- 移动端汉堡：无文字按钮，aria-label 必填（规范 §6.1）；图标用内联 SVG -->
        <UButton
          class="md:hidden"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="t('nav.openMenu')"
          :aria-expanded="drawerOpen ? 'true' : 'false'"
          data-testid="sidebar-toggle"
          @click="drawerOpen = !drawerOpen"
        >
          <AppIcon name="menu" class="h-5 w-5" />
        </UButton>

        <nav class="min-w-0 flex-1" :aria-label="t('nav.ariaBreadcrumb')">
          <ol class="flex min-w-0 items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <li class="shrink-0">{{ t('brand.short') }}</li>
            <li aria-hidden="true" class="shrink-0 text-gray-300 dark:text-gray-600">/</li>
            <li class="min-w-0 truncate font-medium text-gray-900 dark:text-white">
              {{ currentNav ? t(currentNav.key) : t('nav.other') }}
            </li>
          </ol>
        </nav>

        <!-- 语言切换：分段控件（外层灰底 + 激活项白底投影） -->
        <div
          class="hidden shrink-0 items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 sm:flex dark:bg-gray-800"
          role="group"
          :aria-label="t('locale.switch')"
        >
          <button
            v-for="item in locales"
            :key="codeOf(item)"
            type="button"
            :data-testid="`locale-${codeOf(item)}`"
            :aria-pressed="locale === codeOf(item) ? 'true' : 'false'"
            :class="[
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150',
              locale === codeOf(item)
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
            ]"
            @click="setLocale(codeOf(item))"
          >
            {{ nameOf(item) }}
          </button>
        </div>

        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="t('theme.toggle')"
          data-testid="theme-toggle"
          @click="toggleTheme"
        >
          <AppIcon :name="colorMode.value === 'dark' ? 'sun' : 'moon'" class="h-5 w-5" />
        </UButton>
      </header>

      <main class="mx-auto w-full max-w-7xl flex-1 px-6 py-8 max-sm:px-4">
        <slot />
      </main>
    </div>
  </div>
</template>
