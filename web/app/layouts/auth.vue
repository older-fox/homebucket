<template>
  <div class="auth">
    <!-- 桌面端品牌面板 -->
    <section class="hero">
      <div class="hero-inner">
        <div class="hero-brand">
          <AppLogo :size="44" />
          <div>
            <strong>Homebucket</strong>
            <p>{{ t('common.slogan') }}</p>
          </div>
        </div>

        <ul class="features">
          <li v-for="item in features" :key="item.icon">
            <span class="feature-icon"><UIcon :name="item.icon" /></span>
            <div>
              <p class="feature-title">{{ item.title }}</p>
              <p class="feature-desc">{{ item.desc }}</p>
            </div>
          </li>
        </ul>
      </div>
      <div class="hero-glow" />
    </section>

    <!-- 表单区 -->
    <section class="form-side">
      <div class="corner">
        <UColorModeButton class="icon-btn" />
        <LocaleSwitcher />
      </div>

      <div class="card hb-rise">
        <div class="card-brand">
          <AppLogo :size="36" />
          <h1>Homebucket</h1>
          <p class="hb-muted">{{ t('common.slogan') }}</p>
        </div>
        <slot />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();

const features = computed(() => [
  { icon: 'i-lucide-map-pinned', title: t('location.title'), desc: t('location.dragHint') },
  { icon: 'i-lucide-package', title: t('item.title'), desc: t('item.searchPlaceholder') },
  { icon: 'i-lucide-qr-code', title: t('scan.title'), desc: t('scan.hint') },
]);
</script>

<style scoped>
.auth {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr;
}

/* ---------------- 品牌面板（桌面显示） ---------------- */
.hero {
  display: none;
  position: relative;
  overflow: hidden;
  padding: 48px;
  background: linear-gradient(150deg, var(--hb-brand) 0%, var(--hb-brand-strong) 60%, #083f3b 100%);
  color: #fff;
}

.hero-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 40px;
  height: 100%;
  max-width: 420px;
}

.hero-brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.hero-brand strong {
  display: block;
  font-size: 22px;
  letter-spacing: -0.02em;
}

.hero-brand p {
  margin: 4px 0 0;
  font-size: 13px;
  opacity: 0.85;
}

.features {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.features li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.feature-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: rgb(255 255 255 / 16%);
  flex-shrink: 0;
}

.feature-icon :deep(svg) {
  width: 20px;
  height: 20px;
}

.feature-title {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
}

.feature-desc {
  margin: 3px 0 0;
  font-size: 12.5px;
  opacity: 0.8;
  line-height: 1.5;
}

.hero-glow {
  position: absolute;
  right: -120px;
  bottom: -140px;
  width: 420px;
  height: 420px;
  border-radius: 50%;
  background: rgb(255 255 255 / 10%);
  filter: blur(10px);
}

/* ---------------- 表单侧 ---------------- */
.form-side {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 18px calc(32px + var(--hb-safe-bottom));
}

.corner {
  position: absolute;
  top: 16px;
  right: 16px;
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
  border-radius: var(--hb-r-full);
  color: var(--hb-text-2);
}

.card {
  width: 100%;
  max-width: 400px;
  background: var(--hb-surface);
  border: 1px solid var(--hb-border);
  border-radius: var(--hb-r-xl);
  box-shadow: var(--hb-shadow-lg);
  padding: 28px 24px;
}

.card-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-bottom: 22px;
  text-align: center;
}

.card-brand h1 {
  margin: 6px 0 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--hb-text);
}

.card-brand p {
  margin: 0;
  font-size: 12.5px;
}

@media (min-width: 900px) {
  .auth {
    grid-template-columns: 1.1fr 1fr;
  }

  .hero {
    display: block;
  }

  .form-side {
    padding: 40px;
  }

  .card-brand {
    display: none; /* 桌面端品牌已在左侧面板 */
  }
}
</style>
