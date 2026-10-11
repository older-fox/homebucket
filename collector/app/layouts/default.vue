<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { capture, useApi } from '../composables/useApi';
import type { HealthView, Loaded } from '../composables/useApi';
import { adminSession as session, logout, refresh } from '../composables/useAdminSession';

const api = useApi();
const route = useRoute();
const colorMode = useColorMode();

/** 页脚的版本号与注册开关：公开接口，SSR 期就能取（走 Nitro 内部请求）。 */
const { data: healthData } = await useAsyncData<Loaded<HealthView>>(
  'health',
  () => capture(() => api.health()),
  { default: (): Loaded<HealthView> => ({ data: null, error: '', status: 0 }) },
);

const health = computed(() => healthData.value?.data ?? null);
const healthMessage = computed(() => healthData.value?.error || '服务端未就绪');

function toggleTheme(): void {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark';
}

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/';
  return route.path === path || route.path.startsWith(`${path}/`);
}

// 会话状态只属于浏览器：SSR 拿不到 httpOnly cookie，所以探测放在 mounted 之后。
// 公开页面（/、/stats）不主动探测 —— 那里没有要展示的账号信息，探一次只会白拿一个 401。
const PROTECTED_PATHS = ['/admin', '/audit', '/password'];
/**
 * 顶栏的账号区必须等挂载后再渲染。
 *
 * 原因：首屏是 SSR 出来的（服务端没有 cookie，渲染成「登录」），但客户端路由中间件会在
 * **首次渲染之前**就问到会话，于是客户端第一帧想渲染账号名 —— 与服务端 HTML 对不上，
 * Vue 报 "Hydration completed but contains mismatches"。挂载标记把第一帧压回同一个形状。
 */
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

const navLink =
  'rounded-full px-3 py-1.5 text-sm text-slate-600 no-underline transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';
const navActive = 'bg-brand-50 font-semibold text-brand-700 dark:bg-slate-800 dark:text-brand-100';
const smallButton =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800';
const chip = 'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
const chipAccent = 'border-brand-500/30 bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100';
const chipOk = 'border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
const chipWarn = 'border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
</script>

<template>
  <div class="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <header
      class="sticky top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-5 py-2.5 max-sm:px-3.5 dark:border-slate-800 dark:bg-slate-900"
    >
      <NuxtLink data-testid="brand" to="/" class="flex items-center gap-2.5 text-inherit no-underline">
        <span
          class="grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-gradient-to-br from-brand-500 to-sky-500 text-[13px] font-bold tracking-wide text-white"
        >
          HB
        </span>
        <span>
          <strong class="block text-[15px] leading-tight">HomeBucket 收集器</strong>
          <small class="hidden text-[11px] tracking-wide text-slate-500 sm:block dark:text-slate-400">
            物品信息收集器 · HomeBucket Collector
          </small>
        </span>
      </NuxtLink>

      <nav class="order-last flex w-full flex-wrap gap-1 sm:order-none sm:ml-auto sm:w-auto" aria-label="主导航">
        <NuxtLink data-testid="nav-search" to="/" :class="[navLink, isActive('/') ? navActive : '']">查条码</NuxtLink>
        <NuxtLink data-testid="nav-stats" to="/stats" :class="[navLink, isActive('/stats') ? navActive : '']">
          统计概览
        </NuxtLink>
        <NuxtLink data-testid="nav-audit" to="/audit" :class="[navLink, isActive('/audit') ? navActive : '']">
          上报审计
        </NuxtLink>
        <NuxtLink data-testid="nav-admin" to="/admin" :class="[navLink, isActive('/admin') ? navActive : '']">
          纠错台
        </NuxtLink>
      </nav>

      <div class="ml-auto flex items-center gap-2 sm:ml-0">
        <template v-if="mounted && session.user">
          <span :class="[chip, chipAccent]" data-testid="nav-account" :title="`已登录：${session.user.username}`">
            {{ session.user.username }}
          </span>
          <NuxtLink data-testid="nav-password" to="/password" :class="smallButton">修改密码</NuxtLink>
          <button
            data-testid="nav-logout"
            :class="smallButton"
            type="button"
            :disabled="session.pending"
            @click="onLogout"
          >
            退出登录
          </button>
        </template>
        <NuxtLink v-else data-testid="nav-login" to="/login" :class="smallButton">登录</NuxtLink>
        <button
          data-testid="theme-toggle"
          :class="smallButton"
          type="button"
          aria-label="切换明暗主题"
          @click="toggleTheme"
        >
          <span class="dark:hidden" aria-hidden="true">🌙</span>
          <span class="hidden dark:inline" aria-hidden="true">☀️</span>
        </button>
      </div>
    </header>

    <main class="mx-auto w-full max-w-[1120px] flex-1 px-5 pt-6 pb-12 max-sm:px-3.5">
      <slot />
    </main>

    <footer
      class="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white px-5 py-3.5 text-[12.5px] text-slate-500 max-sm:px-3.5 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
    >
      <template v-if="health">
        <span>v{{ health.version }} · {{ health.storage.provider }}</span>
        <span>
          {{ health.storage.items }} 条资料 / {{ health.storage.contributions }} 次上报 /
          {{ health.storage.instances }} 个实例
        </span>
        <span :class="[chip, health.registrationOpen ? chipOk : chipWarn]">
          {{ health.registrationOpen ? '实例注册开放' : '实例注册已关闭' }}
        </span>
        <span class="flex-1" />
        <span class="font-mono text-xs">{{ health.storage.dataFile }}</span>
      </template>
      <span v-else>{{ healthMessage }}</span>
    </footer>
  </div>
</template>
