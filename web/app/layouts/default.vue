<template>
  <div class="shell">
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
            type="search"
            enterkeyhint="search"
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

      <main class="hb-content page">
        <slot />
      </main>
    </div>

    <!-- ============ 移动端底部 Tab ============ -->
    <nav class="bottom-nav">
      <button
        v-for="item in mobileItems"
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
  </div>
</template>

<script setup lang="ts">
const route = useRoute();
const { t } = useI18n();
const { items, mobileItems, isActive } = useNav();
const { user, logout, fetchMe } = useAuth();

const keyword = ref('');
const moreOpen = ref(false);
const userMenuOpen = ref(false);

const initial = computed(() => (user.value?.username ?? '?').slice(0, 1).toUpperCase());

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
  /* dvh 处理移动端浏览器工具栏高度变化 */
  min-height: 100dvh;
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
  background: color-mix(in srgb, var(--hb-bg) 78%, transparent);
  backdrop-filter: blur(12px);
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
  background: var(--hb-surface);
  color: var(--hb-text);
  font-size: var(--hb-fs-body);
  outline: none;
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
  width: 100%;
  max-width: var(--hb-page-max);
  margin: 0 auto;
  padding: 20px 16px;
  /* 关键：底部留出底部 Tab 的高度，否则内容（如新增物品的提交按钮）会被导航遮住 */
  padding-bottom: calc(var(--hb-bottom-nav) + var(--hb-safe-bottom) + 24px);
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

  .page {
    padding: 26px 24px 40px;
  }
}
@media (max-width: 767px) {
  .search-kbd {
    display: none;
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
</style>
