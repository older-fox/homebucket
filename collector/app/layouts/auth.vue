<script setup lang="ts">
/**
 * 认证外壳：登录页与改密码页专用的**单页**布局（规范 §6.8）。
 *
 * 为什么必须和 default 外壳分开：default 外壳带 256px 侧栏 + 64px 顶栏 + 页脚，
 * 那是"已进入应用之后"的框架。登录页套在里面会出现三个说不通的地方：
 *   1. 侧栏把「纠错台/审计/来源/上级库」全渲染成置灰的锁定项 —— 对着未登录的人
 *      摆一排他点不了的功能，是在提示"你有权限缺口"，而不是请他登录；
 *   2. 顶栏面包屑写的是"HomeBucket / 未找到的当前页"，因为登录页不在导航表里；
 *   3. 页脚会去请求 /api/health 并显示库内条目数 —— 未登录的人本来就不该看到这些。
 * 所以认证类页面整体退出应用外壳，只保留一块全屏画布。
 *
 * 唯一允许用渐变/毛玻璃的位置就是这里（规范 §1.3 与 §6.8），别处一律不许照抄。
 */
import { computed } from 'vue';

const { t, locale, locales } = useI18n();
const colorMode = useColorMode();

/**
 * 语言代码：locales 里既可能是字符串也可能是对象，统一成 code。
 * 与 default 外壳同一套处理 —— 认证页也要能切语言，否则英文用户第一屏就走不下去。
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

function setLocale(code: LocaleCode): void {
  locale.value = code;
}

function toggleTheme(): void {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark';
}

/**
 * 认证画布右侧的角标信息由使用方（login.vue / password.vue）通过 `<NuxtLayout>` 插槽传下来。
 * 这里只声明"可能有"，没有也照常渲染 —— 布局不该依赖某个具体页面。
 */
const slots = useSlots();
const hasAside = computed(() => Boolean(slots.aside));
</script>

<template>
  <div class="relative flex min-h-screen flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-white">
    <!--
      装饰光斑（规范 §6.8：认证页背景允许两团 blur-3xl 的蓝色/靛蓝柔光）。
      纯装饰，aria-hidden；pointer-events-none 保证它不会挡住底下的控件。
    -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div class="absolute -top-32 -left-32 h-[26rem] w-[26rem] rounded-full bg-blue-500/20 blur-3xl" />
      <div class="absolute top-1/3 -right-40 h-[24rem] w-[24rem] rounded-full bg-indigo-500/20 blur-3xl" />
      <div class="absolute -bottom-40 left-1/4 h-[22rem] w-[22rem] rounded-full bg-blue-400/10 blur-3xl" />
    </div>

    <!--
      极简工具条：单页不代表"没有出口"。语言与主题必须能在登录前切换，
      否则深色模式用户在一片白底上登录、英文用户只能读中文界面。
    -->
    <header class="relative z-10 flex h-16 shrink-0 items-center justify-end gap-2 px-6 max-sm:px-4">
      <div
        class="hidden items-center gap-0.5 rounded-lg bg-white/70 p-0.5 ring-1 ring-gray-200 sm:flex dark:bg-gray-900/70 dark:ring-gray-800"
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

    <!-- 内容严格居中：规范 §6.8「全屏居中」。max-w-md 由页面自己声明，这里只负责摆位置。 -->
    <main class="relative z-10 flex flex-1 items-center justify-center px-6 pb-10 max-sm:px-4">
      <slot />
    </main>

    <footer class="relative z-10 shrink-0 px-6 pb-6 text-center max-sm:px-4">
      <slot name="aside">
        <p class="m-0 text-xs text-gray-500 dark:text-gray-400">{{ t('brand.tagline') }}</p>
      </slot>
      <p v-if="hasAside" class="sr-only" aria-hidden="true" />
    </footer>
  </div>
</template>
