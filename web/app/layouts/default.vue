<template>
  <div class="shell" :class="[shellModeClass, mobileModeClass]">
    <!-- ============ 桌面端左侧菜单 ============ -->
    <aside class="sidebar">
      <NuxtLink to="/" class="brand">
        <AppLogo :size="34" />
        <span class="brand-text">
          <strong>Homebucket</strong>
          <small>{{ t('common.slogan') }}</small>
        </span>
      </NuxtLink>

      <div class="family-box">
        <FamilySwitcher />
      </div>

      <nav class="nav">
        <NuxtLink
          v-for="item in items"
          :key="item.key"
          :to="item.to"
          class="nav-item hb-tap"
          :class="{ active: isActive(item, route.path) }"
        >
          <UIcon :name="item.icon" class="nav-icon" />
          <span>{{ t(`nav.${item.key}`) }}</span>
          <span class="nav-rail" />
        </NuxtLink>
      </nav>

      <div class="sidebar-footer">
        <button type="button" class="foot-btn hb-tap" @click="navigateTo('/scan')">
          <UIcon name="i-lucide-scan-line" />
          <span>{{ t('nav.scan') }}</span>
        </button>
        <button type="button" class="foot-btn hb-tap danger" @click="logout">
          <UIcon name="i-lucide-log-out" />
          <span>{{ t('nav.logout') }}</span>
        </button>
      </div>
    </aside>

    <div class="main">
      <!-- ============ 顶栏 ============ -->
      <header class="topbar">
        <NuxtLink to="/" class="brand-mobile">
          <AppLogo :size="26" />
        </NuxtLink>

        <form class="search" @submit.prevent="submitSearch">
          <UIcon name="i-lucide-search" class="search-icon" />
          <input
            v-model="keyword"
            class="search-input"
            type="text"
            inputmode="search"
            enterkeyhint="search"
            autocomplete="off"
            :placeholder="t('common.searchPlaceholder')"
          />
          <kbd class="search-kbd">/</kbd>
        </form>

        <div class="topbar-actions">
          <button
            type="button"
            class="icon-btn mobile-only hb-tap"
            :aria-label="t('nav.scan')"
            @click="navigateTo('/scan')"
          >
            <UIcon name="i-lucide-scan-line" />
          </button>
          <UColorModeButton class="icon-btn" />
          <LocaleSwitcher />
          <button type="button" class="avatar hb-tap" :aria-label="user?.username" @click="userMenuOpen = true">
            {{ initial }}
          </button>
        </div>
      </header>

      <main class="hb-content page" :class="[shellModeClass, mobileModeClass]">
        <div class="scroller">
          <slot />
        </div>
      </main>
    </div>

    <!-- ============ 移动端底部 Tab ============ -->
    <nav class="bottom-nav">
      <button
        v-for="item in leftTabs"
        :key="item.key"
        type="button"
        class="bottom-item"
        :class="{ active: isActive(item, route.path) }"
        @click="tap(item.to)"
      >
        <span class="bottom-pill">
          <UIcon :name="item.icon" class="bottom-icon" />
        </span>
        <span class="bottom-label">{{ t(`nav.${item.key}`) }}</span>
      </button>

      <!-- 扫码：底部中间的核心入口，点击后就地弹出气泡（不跳页） -->
      <UPopover
        v-model:open="scanOpen"
        :content="{ side: 'top', align: 'center', sideOffset: 14 }"
        :ui="{ content: 'w-[15rem] p-2 rounded-[14px]' }"
      >
        <button type="button" class="bottom-scan" :aria-label="t('nav.scan')">
          <span class="scan-circle">
            <UIcon :name="SCAN_ITEM.icon" class="scan-icon" />
          </span>
        </button>

        <template #content>
          <div class="scan-actions">
            <button type="button" class="scan-action hb-tap" @click="startScan('create')">
              <span class="scan-action-icon"><UIcon name="i-lucide-package-plus" /></span>
              <span class="scan-action-text">
                <strong>{{ t('scan.actionCreate') }}</strong>
                <small class="hb-muted">{{ t('scan.actionCreateDesc') }}</small>
              </span>
            </button>
            <button type="button" class="scan-action hb-tap" @click="startScan('find')">
              <span class="scan-action-icon"><UIcon name="i-lucide-search" /></span>
              <span class="scan-action-text">
                <strong>{{ t('scan.actionFind') }}</strong>
                <small class="hb-muted">{{ t('scan.actionFindDesc') }}</small>
              </span>
            </button>
            <button type="button" class="scan-action hb-tap" @click="startScan('edit')">
              <span class="scan-action-icon"><UIcon name="i-lucide-pencil" /></span>
              <span class="scan-action-text">
                <strong>{{ t('scan.actionEdit') }}</strong>
                <small class="hb-muted">{{ t('scan.actionEditDesc') }}</small>
              </span>
            </button>
          </div>
        </template>
      </UPopover>

      <button
        v-for="item in rightTabs"
        :key="item.key"
        type="button"
        class="bottom-item"
        :class="{ active: isActive(item, route.path) }"
        @click="tap(item.to)"
      >
        <span class="bottom-pill">
          <UIcon :name="item.icon" class="bottom-icon" />
        </span>
        <span class="bottom-label">{{ t(`nav.${item.key}`) }}</span>
      </button>

      <button type="button" class="bottom-item" @click="moreOpen = true">
        <span class="bottom-pill">
          <UIcon name="i-lucide-menu" class="bottom-icon" />
        </span>
        <span class="bottom-label">{{ t('common.more') }}</span>
      </button>
    </nav>



    <!-- ============ 移动端抽屉 ============ -->
    <USlideover v-model:open="moreOpen" :title="t('common.more')">
      <template #body>
        <div class="more-list">
          <FamilySwitcher />
          <div class="more-group">
            <button
              v-for="item in items"
              :key="item.key"
              type="button"
              class="foot-btn hb-tap"
              @click="tap(item.to, true)"
            >
              <UIcon :name="item.icon" />
              <span>{{ t(`nav.${item.key}`) }}</span>
            </button>
          </div>
          <button type="button" class="foot-btn hb-tap" @click="tap('/scan', true)">
            <UIcon name="i-lucide-scan-line" />
            <span>{{ t('nav.scan') }}</span>
          </button>
          <button type="button" class="foot-btn hb-tap danger" @click="logout">
            <UIcon name="i-lucide-log-out" />
            <span>{{ t('nav.logout') }}</span>
          </button>
        </div>
      </template>
    </USlideover>

    <!-- ============ 用户菜单 ============ -->
    <UModal v-model:open="userMenuOpen" :title="user?.username">
      <template #body>
        <div class="more-list">
          <div class="user-card">
            <span class="avatar large">{{ initial }}</span>
            <div>
              <p class="user-name">{{ user?.username }}</p>
              <p class="hb-muted small">{{ user?.email }}</p>
            </div>
          </div>
          <button type="button" class="foot-btn hb-tap" @click="goSettings">
            <UIcon name="i-lucide-settings" />
            <span>{{ t('nav.settings') }}</span>
          </button>
          <button type="button" class="foot-btn hb-tap danger" @click="logout">
            <UIcon name="i-lucide-log-out" />
            <span>{{ t('nav.logout') }}</span>
          </button>
        </div>
      </template>
    </UModal>

    <!-- 码枪扫到码时的浮窗：全局只挂一份，监听也由它自己负责 -->
    <ScanActionSheet />
  </div>
</template>

<script setup lang="ts">
const route = useRoute();
const { t } = useI18n();
const { items, mobileItems, isActive } = useNav();
const { SCAN_ITEM } = await import('~/composables/useNav');
const { user, logout, fetchMe } = useAuth();

const keyword = ref('');
const moreOpen = ref(false);
const userMenuOpen = ref(false);
const scanOpen = ref(false);

// 底部 Tab：主页 / 位置 在扫码左侧，物品 / 更多 在右侧（设置收进「更多」）
const leftTabs = computed(() => mobileItems.slice(0, 2));
const rightTabs = computed(() => mobileItems.slice(2));

/** 扫码动作：创建 / 查找 / 编辑，各自带不同的 mode 到扫码页 */
function startScan(mode: 'create' | 'find' | 'edit') {
  scanOpen.value = false;
  navigateTo({ path: '/scan', query: { mode } });
}

const initial = computed(() => (user.value?.username ?? '?').slice(0, 1).toUpperCase());

/**
 * 页面滚动模式（纯 CSS 驱动，渲染期不依赖 matchMedia，避免水合不匹配与首帧闪动）：
 *   layoutMode       桌面端（scroll = 整页滚动；fixed = 面板内滚动）
 *   layoutModeMobile 移动端（缺省沿用桌面端）
 * 具体切换在样式里用媒体查询完成。
 */
const layoutMode = computed(() => (route.meta.layoutMode as 'scroll' | 'fixed') ?? 'scroll');
const layoutModeMobile = computed(
  () => (route.meta.layoutModeMobile as 'scroll' | 'fixed') ?? layoutMode.value,
);
const shellModeClass = computed(() => `mode-${layoutMode.value}`);
const mobileModeClass = computed(() => `mode-mobile-${layoutModeMobile.value}`);

onMounted(() => {
  if (!user.value) void fetchMe();
});

// 桌面端按 / 聚焦搜索框（移动端不劫持软键盘）
onMounted(() => {
  const handler = (event: KeyboardEvent) => {
    if (event.key !== '/' || window.innerWidth < 768) return;
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
    event.preventDefault();
    (document.querySelector('.search-input') as HTMLInputElement | null)?.focus();
  };
  window.addEventListener('keydown', handler);
  onBeforeUnmount(() => window.removeEventListener('keydown', handler));
});

function submitSearch() {
  const q = keyword.value.trim();
  if (q) navigateTo({ path: '/search', query: { q } });
}

/** 移动端点击带轻反馈 */
function tap(to: string, close = false) {
  if (close) moreOpen.value = false;
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(8);
  navigateTo(to);
}

function goSettings() {
  userMenuOpen.value = false;
  navigateTo('/settings');
}
</script>

<style scoped>
.shell {
  display: flex;
  min-height: 100dvh;
}

/* fixed 模式：锁住视口，滚动交给内部容器 */
.shell.mode-fixed {
  height: 100dvh;
  overflow: hidden;
}

.shell.mode-fixed .main {
  min-height: 0;
}

/* ---------------- 侧边栏 ---------------- */
.sidebar {
  display: none;
  width: var(--hb-sidebar-w);
  flex-shrink: 0;
  flex-direction: column;
  gap: 14px;
  padding: 18px 14px;
  background: var(--hb-surface);
  border-right: 1px solid var(--hb-border);
  position: sticky;
  top: 0;
  height: 100vh;
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 4px 8px 10px;
  text-decoration: none;
  color: inherit;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
}

.brand-text strong {
  font-size: var(--hb-fs-h3);
  font-weight: var(--hb-fw-bold);
  letter-spacing: var(--hb-ls-h3);
  color: var(--hb-text);
}

.brand-text small {
  font-size: var(--hb-fs-xs);
  color: var(--hb-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.family-box {
  padding: 4px;
  border-radius: var(--hb-r-md);
  background: var(--hb-surface-2);
  border: 1px solid var(--hb-border);
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 2px;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 12px;
  border-radius: var(--hb-r-md);
  color: var(--hb-text-2);
  text-decoration: none;
  font-size: var(--hb-fs-body);
  font-weight: var(--hb-fw-medium);
  transition:
    background var(--hb-dur) var(--hb-ease),
    color var(--hb-dur) var(--hb-ease);
}

.nav-item:hover {
  background: var(--hb-surface-2);
  color: var(--hb-text);
}

.nav-item.active {
  background: var(--hb-brand-soft);
  color: var(--hb-brand);
  font-weight: var(--hb-fw-semibold);
}

.nav-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.nav-rail {
  position: absolute;
  left: -14px;
  top: 50%;
  width: 3px;
  height: 0;
  border-radius: var(--hb-r-full);
  background: var(--hb-brand);
  transform: translateY(-50%);
  transition: height var(--hb-dur) var(--hb-ease);
}

.nav-item.active .nav-rail {
  height: 20px;
}

.sidebar-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--hb-border);
}

/* ---------------- 通用按钮 ---------------- */
.foot-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: var(--hb-r-md);
  background: transparent;
  color: var(--hb-text-2);
  font-size: var(--hb-fs-body);
  text-align: left;
  cursor: pointer;
  transition: background var(--hb-dur) var(--hb-ease);
}

.foot-btn :deep(svg) {
  width: 18px;
  height: 18px;
}

.foot-btn:hover {
  background: var(--hb-surface-2);
  color: var(--hb-text);
}

.foot-btn.danger:hover {
  background: color-mix(in srgb, var(--hb-danger) 12%, transparent);
  color: var(--hb-danger);
}

/* ---------------- 主区域 ---------------- */
.main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  height: var(--hb-topbar-h);
  padding: 0 16px;
  position: sticky;
  top: 0;
  z-index: 20;
  /* 不透明：半透明 + 模糊在某些移动浏览器上会让白色输入框看起来被"盖一半" */
  background: var(--hb-surface);
  border-bottom: 1px solid var(--hb-border);
}

.brand-mobile {
  display: flex;
}

.search {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
  width: 17px;
  height: 17px;
  color: var(--hb-muted);
  pointer-events: none;
}

.search-input {
  width: 100%;
  height: 40px;
  padding: 0 44px 0 36px;
  border-radius: var(--hb-r-full);
  border: 1px solid var(--hb-border);
  background: var(--hb-surface-2);
  color: var(--hb-text);
  font-size: var(--hb-fs-body);
  line-height: normal;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  transition:
    border-color var(--hb-dur) var(--hb-ease),
    box-shadow var(--hb-dur) var(--hb-ease);
}

.search-input::placeholder {
  color: var(--hb-muted);
}

.search-input:focus {
  border-color: var(--hb-brand);
  box-shadow: 0 0 0 4px var(--hb-brand-soft);
}

.search-kbd {
  position: absolute;
  right: 10px;
  padding: 1px 6px;
  border-radius: 6px;
  border: 1px solid var(--hb-border);
  background: var(--hb-surface-2);
  color: var(--hb-muted);
  font-size: var(--hb-fs-xs);
  font-family: var(--hb-font-mono);
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: var(--hb-r-full);
  background: transparent;
  color: var(--hb-text-2);
  cursor: pointer;
  transition: background var(--hb-dur) var(--hb-ease);
}

.icon-btn:hover {
  background: var(--hb-surface-2);
  color: var(--hb-text);
}

.icon-btn :deep(svg) {
  width: 19px;
  height: 19px;
}

.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: var(--hb-r-full);
  background: linear-gradient(135deg, var(--hb-brand), var(--hb-brand-strong));
  color: #fff;
  font-size: var(--hb-fs-sm);
  font-weight: var(--hb-fw-bold);
  cursor: pointer;
}

.avatar.large {
  width: 44px;
  height: 44px;
  font-size: var(--hb-fs-h3);
}

.page {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: var(--hb-page-max);
  margin: 0 auto;
}

/* 页面内容滚动容器：底部留出底部 Tab 的高度，避免遮挡 */
.scroller {
  flex: 1;
  min-height: 0;
  padding: 20px 16px calc(var(--hb-bottom-nav) + var(--hb-safe-bottom) + 24px);
}

/* fixed：滚动交给页面内部的具体区域 */
.page.mode-fixed {
  min-height: 0;
}

.page.mode-fixed .scroller {
  overflow: hidden;
  display: flex;
  padding-bottom: calc(var(--hb-bottom-nav) + var(--hb-safe-bottom) + 12px);
}

.page.mode-fixed .scroller > * {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 页面标题在滚动时吸顶，长列表不丢上下文 */
.scroller > :deep(.page-header),
.scroller > .page-header {
  position: sticky;
  top: 0;
  z-index: 6;
  background: var(--hb-bg);
}

/* 移动端覆盖：声明了 mobile=scroll 的页面回到整页自然滚动 */
@media (max-width: 767px) {
  .shell.mode-mobile-scroll {
    height: auto;
    overflow: visible;
  }

  .page.mode-mobile-scroll .scroller {
    overflow: visible;
    display: block;
    flex: none;
    padding-bottom: calc(var(--hb-bottom-nav) + var(--hb-safe-bottom) + 24px);
  }

  .page.mode-mobile-scroll .scroller > * {
    display: block;
    flex: none;
  }
}

/* ---------------- 移动端底部 Tab ---------------- */
.bottom-nav {
  display: flex;
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  height: calc(var(--hb-bottom-nav) + var(--hb-safe-bottom));
  padding-bottom: var(--hb-safe-bottom);
  background: color-mix(in srgb, var(--hb-surface) 92%, transparent);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--hb-border);
}

.bottom-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border: 0;
  background: none;
  color: var(--hb-muted);
  cursor: pointer;
}

.bottom-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 28px;
  border-radius: var(--hb-r-full);
  transition: background var(--hb-dur) var(--hb-ease);
}

.bottom-icon {
  width: 21px;
  height: 21px;
}

.bottom-label {
  font-size: var(--hb-fs-xs);
  line-height: 1;
}

.bottom-item.active {
  color: var(--hb-brand);
}

.bottom-item.active .bottom-pill {
  background: var(--hb-brand-soft);
}

.bottom-item.active .bottom-label {
  font-weight: var(--hb-fw-semibold);
}

/* 中间的核心扫码入口 */
.bottom-scan {
  flex: 0 0 64px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  border: 0;
  background: none;
  cursor: pointer;
}

.scan-circle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  margin-top: -14px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--hb-brand), var(--hb-brand-strong));
  color: #fff;
  box-shadow: 0 6px 16px color-mix(in srgb, var(--hb-brand) 45%, transparent);
  transition: transform var(--hb-dur) var(--hb-ease);
}

.bottom-scan:active .scan-circle {
  transform: scale(0.94);
}

.scan-icon {
  width: 24px;
  height: 24px;
}

.scan-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.scan-action {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--hb-border);
  border-radius: var(--hb-r-md);
  background: var(--hb-surface);
  color: var(--hb-text);
  cursor: pointer;
  text-align: left;
}

.scan-action:hover {
  background: var(--hb-surface-2);
  border-color: var(--hb-border-strong);
}

.scan-action-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--hb-r-sm);
  background: var(--hb-brand-soft);
  color: var(--hb-brand);
  flex-shrink: 0;
}

.scan-action-icon :deep(svg) {
  width: 20px;
  height: 20px;
}

.scan-action-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.scan-action-text strong {
  font-size: var(--hb-fs-body);
  font-weight: var(--hb-fw-semibold);
}

.scan-action-text small {
  font-size: var(--hb-fs-xs);
  line-height: 1.35;
}

.scan-action-text strong {
  line-height: 1.3;
}

/* ---------------- 抽屉 / 弹窗内容 ---------------- */
.more-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.more-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  border-radius: var(--hb-r-md);
  background: var(--hb-surface-2);
}

.user-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: var(--hb-r-md);
  background: var(--hb-surface-2);
}

.user-name {
  margin: 0;
  font-weight: var(--hb-fw-semibold);
}

.small {
  font-size: var(--hb-fs-xs);
}

.mobile-only {
  display: inline-flex;
}

/* ---------------- 断点 ---------------- */
@media (max-width: 767px) {
  /* 移动端顶栏搜索太窄，展示不全，直接移除（主页/列表页各自有更大的搜索入口） */
  .search {
    display: none;
  }

  .topbar {
    justify-content: space-between;
  }
}

@media (min-width: 768px) {
  .sidebar {
    display: flex;
  }

  .bottom-nav,
  .brand-mobile,
  .mobile-only {
    display: none;
  }

  .topbar {
    padding: 0 24px;
  }

  .scroller {
    padding: 26px 24px 40px;
  }

  .page.mode-fixed .scroller {
    padding-bottom: 24px;
  }
}
@media (max-width: 767px) {
  .search-kbd {
    display: none;
  }

  /* 移动端没有 kbd 占位，收回右侧留白并略增高，避免文字显示不全 */
  .search-input {
    padding-right: 14px;
    height: 42px;
  }
}

/* 触屏设备：可点元素至少 44×44，圆形头像/图标按钮同时放大宽高，避免被拉成椭圆 */
@media (pointer: coarse) {
  .avatar,
  .icon-btn {
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
  }

  .avatar {
    aspect-ratio: 1 / 1;
  }
}

/* 小屏（≤420px）：能纵向就纵向，避免元素被挤扁 */
@media (max-width: 420px) {
  .topbar {
    padding: 0 10px;
    gap: 6px;
  }

  .page,
  .scroller {
    padding-left: 10px;
    padding-right: 10px;
  }
}
</style>
