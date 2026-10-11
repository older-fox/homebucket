<template>
  <div class="auth">
    <!-- 背景：类 Nuxt 的球型渐变（顶部一颗主球 + 两侧辅光 + 细点阵） -->
    <div class="orb-field" aria-hidden="true">
      <span class="orb orb-main" />
      <span class="orb orb-left" />
      <span class="orb orb-right" />
      <span class="dots" />
    </div>

    <div class="corner">
      <UColorModeButton class="icon-btn" />
      <LocaleSwitcher />
    </div>

    <main class="pane">
      <div class="card hb-rise">
        <div class="card-logo">
          <AppLogo :size="40" />
        </div>
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
/* ==========================================================================
   常规的居中登录窗：一屏一卡，品牌球型渐变在顶部晕开
   ========================================================================== */

.auth {
  position: relative;
  isolation: isolate;
  display: grid;
  place-items: center;
  /* dvh 处理移动端工具栏高度变化，避免"表单被挤到屏幕外/底部留白" */
  min-height: 100dvh;
  padding: 40px 18px calc(40px + var(--hb-safe-bottom));
  box-sizing: border-box;
  overflow: hidden;
}

/* ---------------- 球型渐变背景 ---------------- */

.orb-field {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.orb {
  position: absolute;
  border-radius: 50%;
  /* 大半径模糊 + 自身已经是径向渐变：远看就是一颗发光的球，而不是一块色斑 */
  filter: blur(48px);
}

/* 主球：顶部居中，青绿 → 天蓝，收口处透明 */
.orb-main {
  top: -240px;
  left: 50%;
  width: 560px;
  height: 560px;
  transform: translateX(-50%);
  background: radial-gradient(
    circle at 50% 74%,
    #00dc82 0%,
    #2dd4bf 24%,
    #14b8a6 42%,
    #0ea5e9 62%,
    rgb(14 165 233 / 0%) 74%
  );
  opacity: 0.42;
  animation: hb-orb-float 22s var(--hb-ease) infinite alternate;
}

/* 高光：让球有"从左上被照亮"的立体感 */
.orb-main::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle at 38% 32%, rgb(255 255 255 / 55%), transparent 42%);
}

.orb-left {
  top: 6%;
  left: -9%;
  width: 340px;
  height: 340px;
  background: radial-gradient(circle, #5eead4 0%, rgb(94 234 212 / 0%) 70%);
  opacity: 0.32;
  filter: blur(72px);
}

.orb-right {
  top: 0;
  right: -8%;
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, #38bdf8 0%, rgb(56 189 248 / 0%) 70%);
  opacity: 0.26;
  filter: blur(72px);
}

/* 细点阵：给渐变一点"科技感"的底纹，向下淡出 */
.dots {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgb(15 118 110 / 18%) 1px, transparent 1px);
  background-size: 26px 26px;
  opacity: 0.45;
  -webkit-mask-image: radial-gradient(120% 62% at 50% 0%, #000 0%, transparent 72%);
  mask-image: radial-gradient(120% 62% at 50% 0%, #000 0%, transparent 72%);
}

@keyframes hb-orb-float {
  from {
    transform: translateX(-50%) translateY(0) scale(1);
  }
  to {
    transform: translateX(-50%) translateY(26px) scale(1.05);
  }
}

/* ---------------- 右上角工具（主题 / 语言） ---------------- */

.corner {
  position: absolute;
  top: max(14px, env(safe-area-inset-top, 0px));
  right: 14px;
  z-index: 2;
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

/* ---------------- 卡片 ---------------- */

.pane {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 400px;
}

.card {
  /* 半透明 + 毛玻璃：背景的光球会从卡片边缘透出来一点 */
  background: color-mix(in srgb, var(--hb-surface) 92%, transparent);
  backdrop-filter: blur(14px) saturate(1.1);
  border: 1px solid var(--hb-border);
  border-radius: var(--hb-r-xl);
  box-shadow: var(--hb-shadow-lg);
  padding: 26px 22px 24px;
}

.card-logo {
  display: flex;
  justify-content: center;
  margin-bottom: 14px;
}

/* ---------------- 深色 / 小屏 / 降低动效 ---------------- */

/* 注意：不要写成 :global(.dark) .orb-main —— 编译产物会退化成裸 .dark，
   等于给 <html class="dark"> 加 opacity，整页被冲淡。写成 .dark 后代选择器，
   scoped 只会给末级选择器加 [data-v-xxx]，祖先 .dark 依然能命中。 */
.dark .orb-main {
  opacity: 0.5;
}

.dark .dots {
  background-image: radial-gradient(rgb(94 234 212 / 14%) 1px, transparent 1px);
}

@media (max-width: 480px) {
  .auth {
    padding: 30px 16px calc(30px + var(--hb-safe-bottom));
  }

  /* 小屏只留主球，辅光挤在一起反而脏 */
  .orb-main {
    top: -170px;
    width: 400px;
    height: 400px;
  }

  .orb-left,
  .orb-right {
    display: none;
  }
}

@media (min-width: 900px) {
  .card {
    padding: 32px 30px 28px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .orb-main {
    animation: none;
  }
}
</style>
